# WhatsApp Webhook Testing - cURL Commands

## Base URL
Replace `localhost:8080` with your server URL and port.

## 1. Webhook Verification (GET)

This endpoint is used by WhatsApp to verify your webhook subscription.

### Successful Verification
```bash
curl -X GET "http://localhost:8080/web/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=CHALLENGE_STRING_12345" \
  -H "Content-Type: application/json"
```

**Expected Response:**
- Status: `200 OK`
- Body: `CHALLENGE_STRING_12345` (plain text)

### Failed Verification (Invalid Token)
```bash
curl -X GET "http://localhost:8080/web/webhook?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=CHALLENGE_STRING_12345" \
  -H "Content-Type: application/json"
```

**Expected Response:**
- Status: `403 Forbidden`
- Body: JSON error response

### Failed Verification (Invalid Mode)
```bash
curl -X GET "http://localhost:8080/web/webhook?hub.mode=unsubscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=CHALLENGE_STRING_12345" \
  -H "Content-Type: application/json"
```

**Expected Response:**
- Status: `403 Forbidden`
- Body: JSON error response

---

## 2. Webhook Events (POST)

This endpoint receives webhook notifications from WhatsApp.

### Sample Message Event
```bash
curl -X POST "http://localhost:8080/web/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [
      {
        "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
        "changes": [
          {
            "value": {
              "messaging_product": "whatsapp",
              "metadata": {
                "display_phone_number": "15550555555",
                "phone_number_id": "PHONE_NUMBER_ID"
              },
              "contacts": [
                {
                  "profile": {
                    "name": "John Doe"
                  },
                  "wa_id": "15551234567"
                }
              ],
              "messages": [
                {
                  "from": "15551234567",
                  "id": "wamid.XXX",
                  "timestamp": "1234567890",
                  "type": "text",
                  "text": {
                    "body": "Hello, this is a test message"
                  }
                }
              ]
            },
            "field": "messages"
          }
        ]
      }
    ]
  }'
```

**Expected Response:**
- Status: `200 OK`
- Body: JSON `{"success": true, "data": {"received": true}, "message": "Webhook event received", "timestamp": "..."}`

### Sample Interactive Message (Button Reply)
```bash
curl -X POST "http://localhost:8080/web/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [
      {
        "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
        "changes": [
          {
            "value": {
              "messaging_product": "whatsapp",
              "metadata": {
                "display_phone_number": "15550555555",
                "phone_number_id": "PHONE_NUMBER_ID"
              },
              "messages": [
                {
                  "from": "15551234567",
                  "id": "wamid.XXX",
                  "timestamp": "1234567890",
                  "type": "interactive",
                  "interactive": {
                    "type": "button_reply",
                    "button_reply": {
                      "id": "btn_1",
                      "title": "Yes"
                    }
                  }
                }
              ]
            },
            "field": "messages"
          }
        ]
      }
    ]
  }'
```

### Sample Status Update
```bash
curl -X POST "http://localhost:8080/web/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [
      {
        "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
        "changes": [
          {
            "value": {
              "messaging_product": "whatsapp",
              "metadata": {
                "display_phone_number": "15550555555",
                "phone_number_id": "PHONE_NUMBER_ID"
              },
              "statuses": [
                {
                  "id": "wamid.XXX",
                  "status": "delivered",
                  "timestamp": "1234567890",
                  "recipient_id": "15551234567"
                }
              ]
            },
            "field": "messages"
          }
        ]
      }
    ]
  }'
```

### Sample Image Message
```bash
curl -X POST "http://localhost:8080/web/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [
      {
        "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
        "changes": [
          {
            "value": {
              "messaging_product": "whatsapp",
              "metadata": {
                "display_phone_number": "15550555555",
                "phone_number_id": "PHONE_NUMBER_ID"
              },
              "messages": [
                {
                  "from": "15551234567",
                  "id": "wamid.XXX",
                  "timestamp": "1234567890",
                  "type": "image",
                  "image": {
                    "caption": "Check out this image!",
                    "mime_type": "image/jpeg",
                    "sha256": "hash123",
                    "id": "image_id_123"
                  }
                }
              ]
            },
            "field": "messages"
          }
        ]
      }
    ]
  }'
```

### Sample Failed Message Status
```bash
curl -X POST "http://localhost:8080/web/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [
      {
        "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
        "changes": [
          {
            "value": {
              "messaging_product": "whatsapp",
              "metadata": {
                "display_phone_number": "15550555555",
                "phone_number_id": "PHONE_NUMBER_ID"
              },
              "statuses": [
                {
                  "id": "wamid.XXX",
                  "status": "failed",
                  "timestamp": "1234567890",
                  "recipient_id": "15551234567",
                  "errors": [
                    {
                      "code": 131047,
                      "title": "Message undeliverable",
                      "message": "The message could not be delivered"
                    }
                  ]
                }
              ]
            },
            "field": "messages"
          }
        ]
      }
    ]
  }'
```

---

## Environment Setup

Before testing, make sure you have set the `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in your `.env` file:

```env
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_secret_verify_token_here
```

Replace `YOUR_VERIFY_TOKEN` in the GET request with the same value from your `.env` file.

---

## Testing Tips

1. **GET Endpoint**: Use the exact token from your `.env` file for successful verification
2. **POST Endpoint**: The endpoint always returns 200 OK immediately, then processes asynchronously
3. **Check Logs**: Monitor your application logs to see the processed events
4. **Flexible Payload**: The webhook accepts any payload structure, so you can test with minimal or extended payloads

---

## Quick Test Script

Save this as `test-webhook.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:8080/web/webhook"
VERIFY_TOKEN="your_verify_token_here"

# Test GET verification
echo "Testing GET verification..."
curl -X GET "${BASE_URL}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=test123" \
  -H "Content-Type: application/json"
echo -e "\n\n"

# Test POST message event
echo "Testing POST message event..."
curl -X POST "${BASE_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "test_id",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "messages": [{
            "from": "15551234567",
            "id": "test_msg_id",
            "timestamp": "1234567890",
            "type": "text",
            "text": {"body": "Test message"}
          }]
        },
        "field": "messages"
      }]
    }]
  }'
echo -e "\n"
```

Make it executable: `chmod +x test-webhook.sh` and run: `./test-webhook.sh`

