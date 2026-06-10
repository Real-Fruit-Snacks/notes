---
title: Python tips
publish: true
tags: [programming, python]
---

# Python tips

A few things I reach for often.

## Comprehensions over loops

```python
# Build a dict of word -> length
words = ["alpha", "beta", "gamma"]
lengths = {w: len(w) for w in words}
```

## Dataclasses

```python
from dataclasses import dataclass

@dataclass
class Point:
    x: float
    y: float

    def dist(self) -> float:
        return (self.x ** 2 + self.y ** 2) ** 0.5
```

> [!warning] Mutable default arguments
> Never use a mutable default like `def f(items=[])`. The list is shared across
> calls. Use `None` and create a fresh list inside the function.

Compare the same ideas in [[Rust ownership]]. Related: [[Second brain]].
