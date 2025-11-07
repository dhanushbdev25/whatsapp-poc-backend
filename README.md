# Node-TypeScript  
 
A production-ready skeleton for building Node.js applications with TypeScript.

---

## 🚀 Purpose

This projects provides a robust foundation for building scalable and secure Node.js applications using TypeScript. It includes essential development and production tools with best practices out of the box.

---

## ✨ Features

- Quick project scaffolding
- TypeScript support
- ESLint, Prettier, and Husky integration
- Global error and response handler with standardized response format
- Request/Response logging with timing and performance metrics
- Structured and modular codebase
- Environment configuration with `.env` support
- Request/Response encryption support
- Integrated Winston logger with daily rotation
- Swagger API documentation
- Unit and integration testing setup (Jest + Supertest)
- Production-ready security practices (Helmet, CORS, etc.)

---

## 📦 Core Dependencies

- `express`, `@types/express`
- `typescript`
- `dotenv`
- `cors`
- `helmet`
- `http-status-codes`
- `winston`, `@types/winston`
- `@types/node`

---

## 📋 API Response Format

All API responses follow a standardized format for consistency and better client-side handling.

### Success Response Format

```json
{
  "success": true,
  "data": {
    // Your response data here
  },
  "message": "Optional success message",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Error Response Format

```json
{
  "success": false,
  "message": "Error message",
  "errors": {
    // Optional validation errors object
    "fieldName": ["Error message 1", "Error message 2"]
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Using Response Formatter Utilities

The skeleton provides utility functions for formatting responses:

```typescript
import { successResponse, errorResponse } from '@/utils/responseFormatter';

// Success response
res.locals.data = userData;
res.locals.message = 'User fetched successfully';
super.send(res);

// Or directly use the formatter
const response = successResponse(userData, 'User fetched successfully');
res.json(response);

// Error response (typically handled by error middleware)
const error = errorResponse('Invalid input', validationErrors, 400);
res.status(400).json(error);
```

### BaseApi Class

All controllers extend `BaseApi` which automatically formats responses:

```typescript
import BaseApi from '@/components/BaseApi';

export default class MyController extends BaseApi {
  public async myMethod(req: Request, res: Response) {
    // Set data and optional message
    res.locals.data = { userId: 123, name: 'John' };
    res.locals.message = 'User created successfully';
    
    // Send with automatic formatting
    super.send(res, StatusCodes.CREATED);
  }
}
```

---

## 📊 Request Logging

The skeleton includes comprehensive request/response logging middleware that automatically logs all HTTP requests with timing information.

### What Gets Logged

- **Request Details:**
  - HTTP method (GET, POST, etc.)
  - Request URL
  - Client IP address
  - User agent
  - User ID (if authenticated)

- **Response Details:**
  - HTTP status code
  - Response time in milliseconds
  - Timestamp

- **Error Details (for 4xx/5xx responses):**
  - Request body (sanitized - sensitive fields are redacted)
  - Query parameters

### Log Format

```json
{
  "method": "POST",
  "url": "/api/users",
  "statusCode": 200,
  "responseTime": 45,
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "userId": "user-123",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Log Levels

- **`info`** - Successful requests (2xx status codes)
- **`warn`** - Client errors (4xx status codes)
- **`error`** - Server errors (5xx status codes)

### Excluded Routes

The following routes are excluded from detailed logging to reduce noise:
- `/health-check`
- `/` (root)

### Security Considerations

- Sensitive fields in request bodies are automatically redacted:
  - `password`
  - `token`
  - `accessToken`
  - `refreshToken`
  - `secret`
  - `authorization`

### Configuration

The request logger is automatically enabled for all routes. It's integrated in the middleware stack after body parsing to ensure access to request data.

### Viewing Logs

Logs are written to:
- **Console** - All log levels in development
- **File** - Rotated daily in `./logs/` directory
  - Info level and above in development
  - Warn level and above in production
  - Max file size: 20MB
  - Retention: 7 days

### Example Log Output

```
[2024-01-01 12:00:00] INFO: HTTP Request {
  method: 'POST',
  url: '/web/auth/login',
  statusCode: 200,
  responseTime: 123,
  ip: '192.168.1.1',
  userId: 'user-abc-123',
  timestamp: '2024-01-01T12:00:00.000Z'
}
```

---

 
