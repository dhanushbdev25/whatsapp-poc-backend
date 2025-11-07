# Authentication & Authorization System

## Overview

This system implements a flexible role-based access control (RBAC) architecture with support for multiple roles per user, permission-based authorization, and dual authentication methods (local password and Azure AD).

## Database Schema

### Master Tables

#### 1. UserMaster (`users` table)
Stores user information and authentication data:
- `id` (UUID, Primary Key)
- `name` (Text)
- `email` (Text, Unique)
- `isActive` (Boolean)
- `passwordHash` (Text) - For local authentication
- `lastLogin` (Timestamp)
- `loginAttempts` (Integer)
- `isLocked` (Boolean)
- `jobTitle` (Varchar)
- `mobileNo` (Varchar)
- `azureId` (UUID) - For Azure AD integration
- `createdAt` (Timestamp)
- `updatedAt` (Timestamp)

#### 2. RoleMaster (`roles` table)
Stores available roles in the system:
- `id` (Integer, Primary Key, Auto-increment)
- `name` (Enum: ADMIN, USER, MODERATOR, VIEWER)
- `description` (Text)
- `isActive` (Boolean)

#### 3. PermissionMaster (`permissions` table)
Stores available permissions:
- `id` (Integer, Primary Key, Auto-increment)
- `code` (Varchar, Unique) - Permission identifier (e.g., 'viewdashboard', 'manageusers')
- `description` (Text)

### Mapping Tables

#### 4. UserRoles (`user_roles` table)
Maps users to their roles (many-to-many relationship):
- `userId` (UUID, Foreign Key → users.id)
- `roleId` (Integer, Foreign Key → roles.id)
- `isDefault` (Boolean) - **One role per user must be marked as default**
- Composite Primary Key: (userId, roleId)

**Key Points:**
- A user can have multiple roles
- Each user must have exactly one default role (used in JWT tokens)
- The default role's ID is included in the access token

#### 5. RolePermissions (`role_permissions` table)
Maps roles to their permissions (many-to-many relationship):
- `roleId` (Integer, Foreign Key → roles.id)
- `permissionId` (Integer, Foreign Key → permissions.id)
- Composite Primary Key: (permissionId, roleId)

## Authentication Flow

### 1. Local Login (Email/Password)

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "userpassword"
}
```

**Flow:**
1. Validate email and password from request body
2. Query `users` table by email
3. Verify password hash using bcrypt
4. Check if user is active (`isActive = true`)
5. Retrieve user's default role from `user_roles` where `isDefault = true`
6. Generate JWT tokens (access + refresh)
7. Set cookies with tokens
8. Return success response

**Response:**
- Sets `accessToken` cookie (30 minutes, httpOnly: false)
- Sets `refreshToken` cookie (7 days, httpOnly: true)
- Returns success message

### 2. Azure AD Login

**Endpoint:** `POST /auth/login`

**Request Headers:**
```
Authorization: Bearer <azure_access_token>
```

**Flow:**
1. Extract Azure token from Authorization header
2. Validate token with Microsoft Graph API
3. Extract user email from Azure profile
4. Check if user exists in database
   - **If exists:** Return existing user
   - **If new:** Create new user with default role
5. Retrieve user's default role
6. Generate JWT tokens
7. Set cookies with tokens
8. Return success response

**New User Creation:**
- Automatically assigns first available active role as default
- Creates entry in `user_roles` with `isDefault = true`

### 3. Token Refresh

**Endpoint:** `GET /auth/refresh`

**Request:**
- Cookie: `refreshToken` OR
- Body: `{ "refreshToken": "..." }`

**Flow:**
1. Verify refresh token signature
2. Extract `userId` from token
3. Query user from database
4. Retrieve user's default role
5. Generate new access token (15 minutes) and refresh token (7 days)
6. Update cookies
7. Return success response

### 4. Logout

**Endpoint:** `POST /auth/logout`

**Flow:**
1. Clear `accessToken` cookie
2. Clear `refreshToken` cookie
3. Return success response

## JWT Token Structure

### Access Token
```json
{
  "userId": "uuid",
  "name": "User Name",
  "email": "user@example.com",
  "roleId": 1
}
```
- **Expiration:** 30 minutes (login) / 15 minutes (refresh)
- **Contains:** User info + default role ID
- **Storage:** Cookie (httpOnly: false) or Authorization header

### Refresh Token
```json
{
  "userId": "uuid"
}
```
- **Expiration:** 7 days
- **Contains:** Only user ID
- **Storage:** Cookie (httpOnly: true)

## Authorization Flow

### 1. Protect Middleware

**Location:** `src/middleware/protect.ts`

**Purpose:** Authenticates requests and attaches user details to request object

**Flow:**
1. Extract token from cookie or Authorization header
2. Verify JWT token signature
3. Extract `userId` and `roleId` from token
4. Query user with default role from database
5. **Aggregate permissions from ALL user roles** (not just default)
6. Attach user details to `req.user_details`:
   ```typescript
   {
     id: string,
     name: string,
     email: string,
     roleId: number,        // Default role ID
     roleName: string,      // Default role name
     permissions: string[]   // All permissions from all roles
   }
   ```

**Key Feature:** Permissions are aggregated from all roles a user has, providing maximum access based on union of all role permissions.

### 2. Role-Based Access Middleware

**Location:** `src/middleware/roleBasesAccess/roleAccessManager.ts`

**Purpose:** Checks if user has specific permission

**Usage:**
```typescript
import RoleBaseAccess from '@/middleware/roleBasesAccess/roleAccessManager';

// In route definition
router.get('/admin/users', 
  protect, 
  RoleBaseAccess.middleware('manageusers'),
  controller.getUsers
);
```

**Flow:**
1. Check if `req.user_details.permissions` includes the required permission
2. If yes, allow request to proceed
3. If no, return 403 Forbidden

**Note:** Uses aggregated permissions from all user roles, not just the default role.

## Request Flow Example

```
1. Client Request
   ↓
2. Protect Middleware
   - Verify JWT token
   - Load user from database
   - Get default role
   - Aggregate permissions from all roles
   - Attach to req.user_details
   ↓
3. Role-Based Access Middleware (if applicable)
   - Check permission in req.user_details.permissions
   - Allow or deny
   ↓
4. Controller
   - Access req.user_details for user info
   - Process request
   ↓
5. Response
```

## Usage Examples

### Protecting a Route

```typescript
import protect from '@/middleware/protect';
import RoleBaseAccess from '@/middleware/roleBasesAccess/roleAccessManager';

// Basic protection (any authenticated user)
router.get('/profile', protect, getProfile);

// Protection with specific permission
router.get('/admin/users', 
  protect, 
  RoleBaseAccess.middleware('manageusers'),
  getUsers
);
```

### Accessing User Details in Controller

```typescript
export async function getProfile(req: Request, res: Response) {
  // User details are available after protect middleware
  const userId = req.user_details.id;
  const userName = req.user_details.name;
  const userEmail = req.user_details.email;
  const defaultRoleId = req.user_details.roleId;
  const defaultRoleName = req.user_details.roleName;
  const allPermissions = req.user_details.permissions;
  
  // Use the data...
}
```

### Checking Permissions Programmatically

```typescript
// Check if user has a specific permission
if (req.user_details.permissions.includes('manageusers')) {
  // User can manage users
}

// Check multiple permissions
const canManage = ['manageusers', 'adminsettings'].every(
  perm => req.user_details.permissions.includes(perm)
);
```

## API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/login` | Login (local or Azure) | No |
| GET | `/auth/refresh` | Refresh access token | No (refresh token) |
| POST | `/auth/logout` | Logout | No |

### Protected Endpoints

All other endpoints require the `protect` middleware and optionally permission-based middleware.

## Multiple Roles Feature

### How It Works

1. **User Assignment:** A user can be assigned multiple roles via the `user_roles` table
2. **Default Role:** One role must be marked as `isDefault = true` (used in JWT tokens)
3. **Permission Aggregation:** When a user logs in, permissions from ALL their roles are aggregated
4. **Access Control:** Authorization checks use the aggregated permissions list

### Example Scenario

**User:** John Doe
- **Roles:** ADMIN (default), MODERATOR
- **ADMIN permissions:** manageusers, adminsettings, viewdashboard
- **MODERATOR permissions:** viewreports, viewdashboard

**Result:**
- JWT token contains: `roleId: 1` (ADMIN - the default role)
- `req.user_details.permissions`: `['manageusers', 'adminsettings', 'viewdashboard', 'viewreports']`
- User has access to all permissions from both roles

### Setting Default Role

When creating or updating user roles:
```sql
-- Set a role as default (ensure only one default per user)
UPDATE user_roles 
SET isDefault = false 
WHERE userId = 'user-uuid';

INSERT INTO user_roles (userId, roleId, isDefault)
VALUES ('user-uuid', 2, true);
```

## Security Features

1. **Password Hashing:** Uses bcrypt for password storage
2. **JWT Tokens:** Signed tokens with expiration
3. **HttpOnly Cookies:** Refresh tokens stored in httpOnly cookies
4. **Account Locking:** Support for `isLocked` flag and `loginAttempts` tracking
5. **Active Status:** Users must be active (`isActive = true`) to login
6. **Token Refresh:** Short-lived access tokens with long-lived refresh tokens

## Environment Variables

Required environment variables:
- `JWT_SECRET` - Secret for signing access tokens
- `JWT_REFRESH_SECRET` - Secret for signing refresh tokens
- `COOKIE_DOMAIN` - Domain for cookies (production)
- `NODE_ENV` - Environment (local/prod)

## Database Seeding

Seed files are located in `src/database/seeds/`:

1. **roles.seed.ts** - Seeds role master table
2. **permissions.seed.ts** - Seeds permission master table
3. **rolePermissions.seed.ts** - Maps roles to permissions
4. **users.seed.ts** - Seeds users and creates user-role mappings

Run seeding:
```bash
DB_SEEDING=true npm run seed
```

## Error Handling

Common error responses:

- **401 Unauthorized:** Invalid or missing token
- **403 Forbidden:** User lacks required permission
- **400 Bad Request:** Invalid credentials or missing data
- **500 Internal Server Error:** Database or system errors

## Best Practices

1. **Always use protect middleware** for authenticated routes
2. **Use permission-based middleware** for fine-grained access control
3. **Check permissions** in controllers when needed
4. **Ensure one default role** per user at all times
5. **Use aggregated permissions** for access checks, not individual roles
6. **Keep access tokens short-lived** (15-30 minutes)
7. **Use refresh tokens** for long-term sessions

## Migration Notes

If migrating from the old system:
1. Move `users.roleId` to `user_roles` with `isDefault = true`
2. Move `auth_users` data into `users` table
3. Delete `auth_users` and `sub_roles` tables
4. Ensure all users have exactly one default role

