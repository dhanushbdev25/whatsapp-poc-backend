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

## 3. WhatsApp Flow Completion (POST)

This endpoint receives WhatsApp Flow completion events when a user completes a flow form.

### Sample Flow Completion with Customer Registration
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
                  "wa_id": "918610031033"
                }
              ],
              "messages": [
                {
                  "from": "918610031033",
                  "id": "wamid.XXX",
                  "timestamp": "1234567890",
                  "type": "interactive",
                  "interactive": {
                    "type": "flow",
                    "flow_response_json": "{\"version\":\"3\",\"screen\":\"COMPLETE\",\"data\":{\"firstname\":\"John\",\"lastname\":\"Doe\",\"email\":\"john.doe@example.com\",\"phone\":\"918610031033\",\"street_address\":\"123 Main Street\",\"city\":\"Mumbai\",\"pincode\":\"400001\"}}"
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

### Sample Flow Completion with Custom Template Configuration
You can include `template_name` and `header_image_url` in the flow data to customize the enrollment message:

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
                    "name": "Jane Smith"
                  },
                  "wa_id": "919876543210"
                }
              ],
              "messages": [
                {
                  "from": "919876543210",
                  "id": "wamid.XXX",
                  "timestamp": "1234567890",
                  "type": "interactive",
                  "interactive": {
                    "type": "flow",
                    "flow_response_json": "{\"version\":\"3\",\"screen\":\"COMPLETE\",\"data\":{\"firstname\":\"Jane\",\"lastname\":\"Smith\",\"email\":\"jane.smith@example.com\",\"phone\":\"919876543210\",\"street_address\":\"456 Park Avenue\",\"city\":\"Delhi\",\"pincode\":\"110001\",\"template_name\":\"custom_template_name\",\"header_image_url\":\"https://example.com/custom-image.jpg\"}}"
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

**Note:** The `template_name` and `header_image_url` fields in the flow data are optional. If not provided, the system will use environment variable defaults or hardcoded defaults.

**Expected Response:**
- Status: `200 OK`
- Body: JSON `{"success": true, "data": {"received": true}, "message": "Webhook event received", "timestamp": "..."}`

**Expected Logs:**
- `"Flow interactive message received"` - Shows flow structure
- `"Flow data extracted from flow_response_json"` - Confirms data extraction
- `"Processing WhatsApp Flow completion"` - Shows flow completion
- `"Customer created successfully from WhatsApp Flow"` - Confirms customer creation
- `"Enrollment confirmation message sent successfully"` - Confirms enrollment message sent

**Note:** After successful customer creation, an enrollment confirmation message is automatically sent to the customer using the configured template with their name as a parameter.

### Alternative Flow Data Structure (flow_response_data)
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
                    "name": "Jane Smith"
                  },
                  "wa_id": "919876543210"
                }
              ],
              "messages": [
                {
                  "from": "919876543210",
                  "id": "wamid.XXX",
                  "timestamp": "1234567890",
                  "type": "interactive",
                  "interactive": {
                    "type": "flow",
                    "flow_response_data": {
                      "version": "3",
                      "screen": "COMPLETE",
                      "data": {
                        "firstname": "Jane",
                        "lastname": "Smith",
                        "email": "jane.smith@example.com",
                        "phone": "919876543210",
                        "street_address": "456 Park Avenue",
                        "city": "Delhi",
                        "pincode": "110001"
                      }
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

### Flow with Incomplete Screen (Should Not Create Customer)
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
                    "name": "Test User"
                  },
                  "wa_id": "918610031033"
                }
              ],
              "messages": [
                {
                  "from": "918610031033",
                  "id": "wamid.XXX",
                  "timestamp": "1234567890",
                  "type": "interactive",
                  "interactive": {
                    "type": "flow",
                    "flow_response_json": "{\"version\":\"3\",\"screen\":\"SCREEN_1\",\"data\":{\"firstname\":\"Test\"}}"
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

**Expected Behavior:**
- Status: `200 OK` (webhook always returns 200)
- Logs: `"Flow response received but not completed"` - Customer should NOT be created

### Flow Completion Without wa_id in Contacts (Uses message.from as fallback)
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
                  "from": "918610031033",
                  "id": "wamid.XXX",
                  "timestamp": "1234567890",
                  "type": "interactive",
                  "interactive": {
                    "type": "flow",
                    "flow_response_json": "{\"version\":\"3\",\"screen\":\"COMPLETE\",\"data\":{\"firstname\":\"Test\",\"lastname\":\"User\",\"email\":\"test@example.com\",\"phone\":\"918610031033\",\"street_address\":\"789 Test Street\",\"city\":\"Bangalore\",\"pincode\":\"560001\"}}"
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

**Expected Behavior:**
- Uses `message.from` as wa_id when contacts array is not available
- Customer created with customerID = 918610031033

### Testing Duplicate Customer Prevention
Run the same Flow completion curl twice:

```bash
# First run - should create customer
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
                  "wa_id": "918610031033"
                }
              ],
              "messages": [
                {
                  "from": "918610031033",
                  "id": "wamid.XXX",
                  "timestamp": "1234567890",
                  "type": "interactive",
                  "interactive": {
                    "type": "flow",
                    "flow_response_json": "{\"version\":\"3\",\"screen\":\"COMPLETE\",\"data\":{\"firstname\":\"John\",\"lastname\":\"Doe\",\"email\":\"john.doe@example.com\",\"phone\":\"918610031033\",\"street_address\":\"123 Main Street\",\"city\":\"Mumbai\",\"pincode\":\"400001\"}}"
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

# Second run - should skip creation (customer already exists)
# Use the same curl command above
```

**Expected Behavior:**
- First run: Customer created successfully
- Second run: Log shows `"Customer already exists, skipping creation"` - No duplicate created

---

## Environment Setup

Before testing, make sure you have set the following WhatsApp configuration in your `.env` file:

```env
# Webhook Verification
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_secret_verify_token_here

# WhatsApp API Configuration (for sending messages)
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here

# Optional WhatsApp API Settings
WHATSAPP_API_VERSION=v21.0

# Optional defaults for enrollment template (can be overridden via flow data)
WHATSAPP_ENROLLMENT_TEMPLATE_NAME=lush_loyalty_main_menu_premium
WHATSAPP_ENROLLMENT_HEADER_IMAGE_URL=https://mtbsapoc.blob.core.windows.net/whatsapppoccontainer/lush-products-main.jpg
```

**Required Variables:**
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` - Token for webhook verification (used in GET endpoint)
- `WHATSAPP_ACCESS_TOKEN` - Bearer token for WhatsApp Graph API (for sending messages)
- `WHATSAPP_PHONE_NUMBER_ID` - Your WhatsApp Business Phone Number ID (e.g., "918090124709683")

**Optional Variables:**
- `WHATSAPP_API_VERSION` - WhatsApp API version (default: "v21.0")
- `WHATSAPP_ENROLLMENT_TEMPLATE_NAME` - Default template name (can be overridden via flow data `template_name` or `templateName`)
- `WHATSAPP_ENROLLMENT_HEADER_IMAGE_URL` - Default header image URL (can be overridden via flow data `header_image_url` or `headerImageUrl`)

**Note:** Template name and header image URL can be passed in the flow data itself, making them configurable per flow without changing environment variables. The priority is: Flow Data → Environment Variable → Hardcoded Default

Replace `YOUR_VERIFY_TOKEN` in the GET request with the same value from your `.env` file.

---

## Testing Tips

1. **GET Endpoint**: Use the exact token from your `.env` file for successful verification
2. **POST Endpoint**: The endpoint always returns 200 OK immediately, then processes asynchronously
3. **Check Logs**: Monitor your application logs to see the processed events
4. **Flexible Payload**: The webhook accepts any payload structure, so you can test with minimal or extended payloads

---

## 4. Testing Flow Customer Registration

### Complete Flow Test Script

Save this as `test-flow-registration.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:8080/web/webhook"
WA_ID="918610031033"

echo "Testing WhatsApp Flow Customer Registration..."
echo ""

# Test Flow completion with customer data
curl -X POST "${BASE_URL}" \
  -H "Content-Type: application/json" \
  -d "{
    \"object\": \"whatsapp_business_account\",
    \"entry\": [{
      \"id\": \"test_id\",
      \"changes\": [{
        \"value\": {
          \"messaging_product\": \"whatsapp\",
          \"metadata\": {
            \"display_phone_number\": \"15550555555\",
            \"phone_number_id\": \"PHONE_NUMBER_ID\"
          },
          \"contacts\": [{
            \"profile\": {
              \"name\": \"Test User\"
            },
            \"wa_id\": \"${WA_ID}\"
          }],
          \"messages\": [{
            \"from\": \"${WA_ID}\",
            \"id\": \"test_msg_id\",
            \"timestamp\": \"1234567890\",
            \"type\": \"interactive\",
            \"interactive\": {
              \"type\": \"flow\",
              \"flow_response_json\": \"{\\\"version\\\":\\\"3\\\",\\\"screen\\\":\\\"COMPLETE\\\",\\\"data\\\":{\\\"firstname\\\":\\\"Test\\\",\\\"lastname\\\":\\\"User\\\",\\\"email\\\":\\\"test.user@example.com\\\",\\\"phone\\\":\\\"${WA_ID}\\\",\\\"street_address\\\":\\\"123 Test Street\\\",\\\"city\\\":\\\"Mumbai\\\",\\\"pincode\\\":\\\"400001\\\"}}\"
            }
          }]
        },
        \"field\": \"messages\"
      }]
    }]
  }"

echo -e "\n\nCheck your logs for customer creation confirmation!"
```

Make it executable: `chmod +x test-flow-registration.sh` and run: `./test-flow-registration.sh`

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

