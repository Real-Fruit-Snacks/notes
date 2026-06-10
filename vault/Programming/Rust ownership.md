---
title: Rust ownership
publish: true
tags: [programming, rust]
---

# Rust ownership

Ownership is how Rust manages memory without a garbage collector. Three rules:

1. Each value has a single **owner**.
2. There can be only one owner at a time.
3. When the owner goes out of scope, the value is dropped.

```rust
fn main() {
    let s = String::from("hello");
    takes_ownership(s);      // s is moved here…
    // println!("{}", s);    // …so this would not compile
}

fn takes_ownership(some_string: String) {
    println!("{}", some_string);
}
```

> [!danger] Borrow checker
> If you fight the borrow checker, the borrow checker wins. Reach for references
> (`&T`) and slices before you reach for `.clone()`.

Coming from [[Python tips|Python]]? Ownership is the big mental shift.
