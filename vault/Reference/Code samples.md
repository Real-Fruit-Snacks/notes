---
title: Code samples
publish: true
date: 2026-06-09
description: Fenced code blocks across many languages — language labels and highlighting.
tags: [reference, demo, programming]
---

# Code samples

Each block shows its **language label** (top-left) and a **copy button** on hover.
Compare with [[Python tips]] and [[Rust ownership]]. Back to [[Markdown guide]].

## Python

```python
from dataclasses import dataclass

@dataclass
class Point:
    x: float
    y: float

    def dist(self) -> float:
        return (self.x ** 2 + self.y ** 2) ** 0.5

print(Point(3, 4).dist())  # 5.0
```

## JavaScript

```javascript
const notes = ["a", "b", "c"];
const index = notes.map((n, i) => ({ id: i, title: n }));
console.log(index.filter((x) => x.id > 0));
```

## Rust

```rust
fn main() {
    let nums = vec![1, 2, 3];
    let total: i32 = nums.iter().sum();
    println!("sum = {total}");
}
```

## Go

```go
package main

import "fmt"

func main() {
    fmt.Println("hello, world")
}
```

## Bash

```bash
#!/usr/bin/env bash
set -euo pipefail
for f in *.md; do
  echo "Publishing $f"
done
```

## JSON

```json
{
  "title": "My Notes",
  "publish": true,
  "tags": ["reference", "demo"]
}
```

## SQL

```sql
SELECT title, COUNT(*) AS links
FROM notes
JOIN edges ON edges.target = notes.slug
GROUP BY title
ORDER BY links DESC;
```

## CSS

```css
.callout {
  border-left: 4px solid var(--accent);
  border-radius: 8px;
}
```

## HTML

```html
<article class="note">
  <h1>Hello</h1>
  <p>A paragraph.</p>
</article>
```

## A plain block (no language)

```
No language here — so no label, just monospaced text.
plain → unstyled
```

## Inline code

You can also write `inline code` mid-sentence, like `git commit -m "msg"`.
