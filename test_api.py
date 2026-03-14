import urllib.request
import json
import sys

req = urllib.request.Request(
    'http://127.0.0.1:8000/api/generate',
    data=json.dumps({'content': 'What is photosynthesis?', 'count': 1, 'isImage': False}).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

try:
    res = urllib.request.urlopen(req)
    print(res.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('HTTPError:', e.code)
    print(e.read().decode('utf-8'))
    sys.exit(1)
except Exception as e:
    print('Exception:', e)
    sys.exit(1)
