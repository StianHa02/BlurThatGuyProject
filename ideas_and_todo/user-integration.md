# User Integration — BlurThatGuy

## Do you need it?

Before implementing, consider what user accounts actually give you:

- Journalists can come back and find their files
- Audit trail of who processed what footage
- Per-user rate limiting
- The share link feature becomes scoped to the sender

If none of these matter for your use case right now, skip it. A login screen adds friction for journalists in the field. The current API key approach is fine for a controlled rollout.

If you do want it, here is the full picture.

---

## How little the backend changes

Your entire auth is one function:

```python
async def verify_api_key(x_api_key: str = Header(default=None)) -> bool:
```

Every protected endpoint uses `Depends(verify_api_key)`. That is the only thing that changes in the backend — replace this one function, do a find-and-replace on the dependency name across 7 endpoints. The rest of the backend is completely auth-agnostic. Job IDs, Redis state, file paths — none of it is tied to a user identity today.

**Backend modification: ~20 lines changed, 0 new files.**

---

## Option A — Supabase

Supabase is a hosted Postgres + auth platform. JWT-based, Next.js SDK available, clean hosted UI you can customise.

### Backend change

```python
from supabase import create_client

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"],
)

async def verify_token(authorization: str = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.removeprefix("Bearer ")
    user = supabase.auth.get_user(token)
    if not user or not user.user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user.user  # user.id available if needed
```

Then find-and-replace `Depends(verify_api_key)` → `Depends(verify_token)` across `main.py`.

### Frontend changes

Supabase has a Next.js SDK (`@supabase/ssr`) that handles sessions, token refresh, and protected routes. You need:

- Login page
- Signup page (or invite-only flow)
- Auth provider wrapping your app
- API client updated to attach `Authorization: Bearer <token>` header

Estimated: 3–4 new pages/components, API client updated in one place.

### docker-compose.yml

```yaml
environment:
  SUPABASE_URL: https://your-project.supabase.co
  SUPABASE_SERVICE_KEY: your-service-key
```

### Pros
- Fast to implement — excellent Next.js SDK
- Clean hosted auth UI, easy to customise
- Free tier: 50,000 MAU
- Self-hostable on your own EC2 if you ever want to leave the cloud
- Good DX — docs are excellent

### Cons
- Another external service dependency
- Not AWS-native — one more vendor

---

## Option B — AWS Cognito

Cognito is AWS's managed auth service. JWT-based, integrates naturally with the rest of your AWS infrastructure.

### Backend change

```python
import jwt
from jwt import PyJWKClient

COGNITO_REGION = os.environ["AWS_REGION"]
COGNITO_POOL_ID = os.environ["COGNITO_POOL_ID"]
COGNITO_CLIENT_ID = os.environ["COGNITO_APP_CLIENT_ID"]

_jwks_client = PyJWKClient(
    f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_POOL_ID}/.well-known/jwks.json"
)

async def verify_token(authorization: str = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.removeprefix("Bearer ")
    signing_key = _jwks_client.get_signing_key_from_jwt(token)
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=COGNITO_CLIENT_ID,
    )
    return payload  # payload["sub"] is the user ID
```

Then find-and-replace `Depends(verify_api_key)` → `Depends(verify_token)` across `main.py`.

### Frontend changes

AWS Amplify SDK handles Cognito in Next.js. Same scope as Supabase — login page, signup page, auth provider, API client update. The hosted Cognito UI works but is harder to style than Supabase's.

### docker-compose.yml

```yaml
environment:
  COGNITO_POOL_ID: eu-north-1_xxxxxxxxx
  COGNITO_APP_CLIENT_ID: your-client-id
```

### Pros
- Fully AWS-native — one vendor for everything
- No external service dependency beyond AWS
- Pairs cleanly with IAM, CloudWatch, and the rest of your stack
- Free tier: 50,000 MAU

### Cons
- Hosted UI is functional but ugly by default — customisation is painful
- More AWS console setup than Supabase
- Amplify SDK is heavier than Supabase's SDK

---

## Comparison

| | Supabase | Cognito |
|---|---|---|
| Backend changes | ~20 lines | ~25 lines |
| Frontend SDK | `@supabase/ssr` — excellent | Amplify — heavier |
| Hosted UI | Clean, customisable | Works, hard to style |
| Free tier | 50,000 MAU | 50,000 MAU |
| AWS-native | No | Yes |
| Self-hostable | Yes | No |
| Setup time | Faster | Slower |
| Best for | Moving fast, good DX | Already deep in AWS |

---

## Recommendation

If you are already committed to AWS for everything else, Cognito keeps the vendor list short. If you want to move fast and have a clean login UI without fighting CSS, Supabase is the easier path.

For BlurThatGuy specifically — Supabase, because the journalist-facing login screen matters and Supabase's hosted UI is production-ready out of the box.

---

## Implementation order

1. Replace `verify_api_key` with `verify_token` in backend (~20 lines)
2. Add auth provider and login/signup pages in frontend
3. Update API client to attach Bearer token on every request
4. Test dev mode still works (`DEV_MODE=true` bypasses auth — keep that)

To implement, ask Claude: "Swap verify_api_key for Supabase JWT verification in main.py and add login/signup pages to the Next.js frontend using @supabase/ssr."
