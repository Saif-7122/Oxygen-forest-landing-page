import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the base64 image string with assets/estate2.jpg
# We look for the base64 string that starts with data:image/webp;base64,UklGRhKwAA
content = re.sub(
    r'<img src="data:image/webp;base64,UklGRhKwAABX[^"]+"',
    '<img src="assets/estate2.jpg"',
    content
)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replaced second image base64 with assets/estate2.jpg")
