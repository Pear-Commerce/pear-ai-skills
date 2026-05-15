---
name: check-partner-upc
description: Check UPC status, retailers, and availability using Pinterest partner APIs. Supports single or multiple UPCs (comma or space-separated). Use when user wants to check UPC registration status, configured retailers, or store availability.
---

# Check Pinterest Partner UPC Status, Info, and Availability

This skill queries the Pinterest partner APIs to check UPC registration status, configured retailers, and product availability.

Check UPC information for: $ARGUMENTS

Parse the arguments:
- First argument: UPC code(s) - required. Can be a single UPC or multiple UPCs separated by commas or spaces.
- Second argument: Postal code (optional)
- Third argument: Country code, defaults to US (optional)

## API Credentials

```
CLIENT_ID="ea674a5f86039432"
CLIENT_SECRET="b00f082d0cdd25101cec37ed141c5815c8ba62209fc371d9"
```

## Execute These API Calls

For each UPC provided, run the following Pinterest partner API calls:

### 1. UPC Status API

Run this bash command (replace UPC with the user's UPC):

```bash
UPC="REPLACE_WITH_UPC"; URI="/v1/upcs/status"; CLIENT_ID="ea674a5f86039432"; CLIENT_SECRET="b00f082d0cdd25101cec37ed141c5815c8ba62209fc371d9"; TIMESTAMP=$(date +%s); NONCE=$(openssl rand -hex 8); SIGNATURE=$(echo -n "${CLIENT_ID}${URI}${TIMESTAMP}${NONCE}" | openssl dgst -sha256 -hmac "$CLIENT_SECRET" | awk '{print $2}'); curl -s "https://partners.pearcommerce.com/v1/upcs/status?upcs=${UPC}" -H "X-Client-ID: $CLIENT_ID" -H "X-Timestamp: $TIMESTAMP" -H "X-Nonce: $NONCE" -H "X-Signature: $SIGNATURE"
```

### 2. UPC Info & Retailers API

```bash
UPC="REPLACE_WITH_UPC"; URI="/v1/upc/${UPC}"; CLIENT_ID="ea674a5f86039432"; CLIENT_SECRET="b00f082d0cdd25101cec37ed141c5815c8ba62209fc371d9"; TIMESTAMP=$(date +%s); NONCE=$(openssl rand -hex 8); SIGNATURE=$(echo -n "${CLIENT_ID}${URI}${TIMESTAMP}${NONCE}" | openssl dgst -sha256 -hmac "$CLIENT_SECRET" | awk '{print $2}'); curl -s "https://partners.pearcommerce.com/v1/upc/${UPC}" -H "X-Client-ID: $CLIENT_ID" -H "X-Timestamp: $TIMESTAMP" -H "X-Nonce: $NONCE" -H "X-Signature: $SIGNATURE"
```

### 3. Availability API (only if postal_code provided)

```bash
UPC="REPLACE_WITH_UPC"; POSTAL_CODE="REPLACE_WITH_POSTAL"; COUNTRY="US"; URI="/products/availabilities"; CLIENT_ID="ea674a5f86039432"; CLIENT_SECRET="b00f082d0cdd25101cec37ed141c5815c8ba62209fc371d9"; TIMESTAMP=$(date +%s); NONCE=$(openssl rand -hex 8); SIGNATURE=$(echo -n "${CLIENT_ID}${URI}${TIMESTAMP}${NONCE}" | openssl dgst -sha256 -hmac "$CLIENT_SECRET" | awk '{print $2}'); curl -s "https://partners.pearcommerce.com/products/availabilities?product_ids=${UPC}&postal_code=${POSTAL_CODE}&country=${COUNTRY}&product_ids_type=GTIN12" -H "X-Client-ID: $CLIENT_ID" -H "X-Timestamp: $TIMESTAMP" -H "X-Nonce: $NONCE" -H "X-Signature: $SIGNATURE"
```

## Output Format

Present results as:
- STATUS: registration status, product name, is_alcohol, ownership
- RETAILERS: list of configured retailers
- AVAILABILITY: stores with in_stock status (if postal code provided)
