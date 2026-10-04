import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(
    r'<img src="data:image/[^"]+" alt="2,057 sq yd forest estate">', 
    '<img src="assets/estate1.jpg" alt="2,057 sq yd forest estate">', 
    content
)

content = re.sub(
    r'<img src="data:image/[^"]+" alt="3,630 sq yd forest estate">', 
    '<img src="assets/estate2.jpg" alt="3,630 sq yd forest estate">', 
    content
)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done replacing images")
