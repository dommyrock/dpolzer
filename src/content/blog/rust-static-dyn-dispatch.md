---
title: 'Rust static & dyn dispatch'
description: 'Exploration of Rust static & dynamic dispatch desing patterns.'
pubDate: 'Oct 01 2024'
heroImage: '/blog-placeholder-4.jpg'
---

# Rust - Trait Design patterns 

This document focuses on the common design patterns around **[Traits](https://doc.rust-lang.org/reference/items/traits.html#object-safety)**, **Static** and **Dynamic** dispatch ([Trait objects](https://doc.rust-lang.org/reference/types/trait-object.html)).

### Initial Notes: 
> Since Rust doesn't allow inheritance.<br>
> You have to use composition instead of inheritance.<br>
> And when you need polymorphism, you use a trait. <br>

Implementing a trait on a type is similar to implementing regular methods.
```rust
pub trait Summary {
    fn summarize(&self) -> String;
}

pub struct Tweet {
    pub username: String,
    pub content: String,
}

impl Summary for Tweet {
    fn summarize(&self) -> String {
        format!("{}: {}", self.username, self.content)
    }
}
```
Sometimes it’s useful to have default behavior for some or all of the methods in a trait instead of requiring implementations for all methods on every type. 
```rust
pub trait Summary {
    fn summarize_author(&self) -> String;

    fn summarize(&self) -> String {
        format!("(Read more from {}...)", self.summarize_author())
    }
}
```
To use this version of Summary, we only need to define summarize_author when we implement the trait on a type:
```rust
impl Summary for Tweet {
    fn summarize_author(&self) -> String {
        format!("@{}", self.username)
    }
}
```

### Traits as Parameters | [Ref](https://doc.rust-lang.org/reference/types/impl-trait.html)
This parameter accepts any type that implements the specified trait.
```rust
pub fn notify(item: &impl Summary) {
    println!("Breaking news! {}", item.summarize());
}
```

### Trait Bound Syntax | [Ref](https://doc.rust-lang.org/reference/trait-bounds.html)

The impl Trait syntax works for straightforward cases but is actually **syntax sugar** for a longer form known as a **trait bound**; it looks like this:
```rust
pub fn notify<T: Summary>(item: &T) {
    println!("Breaking news! {}", item.summarize());
}
```
This longer form is equivalent to the example in the previous section but is more verbose.<br>
The **impl Trait** syntax is convenient and makes for **more concise code in simple cases**.<br>
While the fuller **trait bound syntax** can express more complexity in other cases. 
<br/>

For example, we can have two parameters that implement Summary. Doing so with the impl Trait syntax looks like this:
```rust
pub fn notify(item1: &impl Summary, item2: &impl Summary) { ...

//Using impl Trait is appropriate if we want this function to allow item1 and item2 to have different types (as long as both types implement Summary).
//If we want to force both parameters to have the same type, however, we must use a trait bound, like this:
pub fn notify<T: Summary>(item1: &T, item2: &T) { ...
```

### Specifying Multiple Trait Bounds with the + Syntax
```rust
pub fn notify(item: &(impl Summary + Display)) { ...

pub fn notify(item: &(impl Summary + Display)) { ...
//With the two trait bounds specified, the body of notify can call summarize and use {} to format item.
```

### Clearer Trait Bounds with where Clauses
Cleaner syntax when you have a lot of trait bounds.<br>
Rust has alternate syntax for specifying trait bounds inside a where clause after the function signature. So, instead of writing this:
```rust
fn some_function<T: Display + Clone, U: Clone + Debug>(t: &T, u: &U) -> i32 { ...

//we can use a where clause, like this:
fn some_function<T, U>(t: &T, u: &U) -> i32
where
    T: Display + Clone,
    U: Clone + Debug,
{
```

Returning Types That Implement Traits
```rust
//We can also use the impl Trait syntax in the return position to return a value of some type that implements a trait, as shown here:
fn returns_summarizable() -> impl Summary {
    Tweet {
        username: String::from("horse_ebooks"),
        content: String::from(
            "of course, as you probably already know, people",
        ),
    }
}
//returns_summarizable function returns some type that implements the Summary trait without naming the concrete type.
```
However, you can only use impl Trait if you’re **returning a single type**.<br>
Returning either a NewsArticle or a Tweet type isn’t allowed due to restrictions around how the impl Trait syntax is implemented in the compiler.<br>
See : [Using Trait Objects That Allow for Values of Different Types](https://doc.rust-lang.org/book/ch17-02-trait-objects.html#using-trait-objects-that-allow-for-values-of-different-types)

### Using Trait Bounds to Conditionally Implement Methods
By using a trait bound with an impl block that uses generic type parameters, we can implement methods conditionally for types that implement the specified traits.

```rust
//in the next impl block, Pair<T> only implements the cmp_display method if its inner type T
//1 implements the PartialOrd trait that enables comparison
//2 and the Display trait that enables printing.
struct Pair<T> {
    x: T,
    y: T,
}

impl<T> Pair<T> {
    fn new(x: T, y: T) -> Self {
        Self { x, y }
    }
}

impl<T: std::fmt::Display + PartialOrd> Pair<T> {
    fn cmp_display(&self) {
        if self.x >= self.y {
            println!("The largest member is x = {}", self.x);
        } else {
            println!("The largest member is y = {}", self.y);
        }
    }
}
```
We can also conditionally implement a trait for any type that implements another trait. 
```rust
impl<T: Display> ToString for T {
    // --snip--
}
//Because the standard library has this blanket implementation, we can call the to_string method
//defined by the ToString trait on any type that implements the Display trait.

//For example, we can turn integers into their corresponding String values like this because integers implement Display
let s = 3.to_string();
```
Blanket implementations appear in the documentation for the trait in the “Implementors” section.


### Fn Traits | [Book](https://doc.rust-lang.org/book/ch13-01-closures.html#moving-captured-values-out-of-closures-and-the-fn-traits) , [Ref](https://doc.rust-lang.org/reference/trait-bounds.html)
```rust
//FnOnce - All closures implement at least this trait
//A closure that moves captured values out of its body will only implement FnOnce and none of the other Fn traits,
//because it can only be called once.
impl<T> Option<T> {
    pub fn unwrap_or_else<F>(self, f: F) -> T
    where
        F: FnOnce() -> T
    {
        match self {
            Some(x) => x,
            None => f(),
        }
    }
}
//The trait bound specified on the generic type F is FnOnce() -> T,
//which means F must be able to be called once, take no arguments, and return a T.
```
Using **FnOnce** in the trait bound expresses the constraint that unwrap_or_else is only going to call f at most one time.
Because all closures implement **FnOnce**, unwrap_or_else accepts all three kinds of closures and is as flexible as it can be.

### Trait objects - Dynamic & Static dispatch | [Book](https://doc.rust-lang.org/book/ch17-02-trait-objects.html#using-trait-objects-that-allow-for-values-of-different-types) , [Ref](https://doc.rust-lang.org/reference/types/trait-object.html)
<br/>

**Monomorphization** process performed by the compiler when we use trait bounds on generics:<br>
the compiler generates nongeneric implementations of functions and methods for each concrete type that we use in place of a generic type parameter.<br>
The code that results from monomorphization is doing **static dispatch**, which is when the compiler knows what method you’re calling at compile time.<br>
This is opposed to **dynamic dispatch**, which is when the compiler can’t tell at compile time which method you’re calling.<br>
In dynamic dispatch cases, the compiler emits code that at runtime will figure out which method to call.
<br/>
When we use trait objects, Rust must use dynamic dispatch.<br>

See: [Great static vs Dyn dispatch comparison](https://oswalt.dev/2021/06/polymorphism-in-rust/)

### Advanced Traits | [Book](https://doc.rust-lang.org/book/ch19-03-advanced-traits.html)

**Associated types** connect a type placeholder with a trait such that the trait method definitions can use these placeholder types in their signatures.<br>
The implementor of a trait will specify the concrete type to be used instead of the placeholder type.<br>
That way, we can define a trait that uses some types without needing to know exactly what those types are until the trait is implemented.
```rust
pub trait Iterator {
    type Item; //associated type (placeholader type)

    fn next(&mut self) -> Option<Self::Item>;
}
```
Why not to use generics instead? 
```rust
pub trait Iterator<T> {
    fn next(&mut self) -> Option<T>;
}
```
The difference is that when using generics, we must annotate the types in each implementation; because we can also implement Iterator<String> for Counter or any other type.<br>
When a trait has a generic parameter, it can be implemented for a type multiple times, changing the concrete types of the generic type parameters each time.<br/>

- With associated types, we don’t need to annotate types because we can’t implement a trait on a type multiple times. <br>(there can only be one impl Iterator for Counter)
<br/>

More complex Associated type example:
```rust
impl<Func, Arg1, Arg2, Fut> Handler<(Arg1, Arg2)> for Func
where
    Func: Fn(Arg1, Arg2) -> Fut + Clone + 'static,
    Fut: Future,
{
    type Output = Fut::Output;
    type Future = Fut;
    
    fn call(&self, (arg1, arg2): (Arg1, Arg2)) -> Self :: Future {
        (self)(arg1, arg2)
    }

}
//This is saying "we are implementing the Handler trait for any function type Func that takes two arguments (Arg1, Arg2)".
//Fut must implement the Future trait, and the associated types Output and Future are derived from this future type.
```

### Default Generic Type Parameters and Operator Overloading
When we use generic type parameters, we can specify a default concrete type for the generic type.<br>
This eliminates the need for implementors of the trait to specify a concrete type.<br>
You specify a default type when declaring a generic type with the **<PlaceholderType=ConcreteType>** syntax.<br>

You can overload the operations and corresponding traits listed in std::ops by implementing the traits associated with the operator.
```rust
#[derive(Debug, Copy, Clone, PartialEq)]
struct Point {
    x: i32,
    y: i32,
}

impl std::ops::Add for Point {
    type Output = Point;

    fn add(self, other: Point) -> Point {
        Point {
            x: self.x + other.x,
            y: self.y + other.y,
        }
    }
}

fn main() {
    assert_eq!(
        Point { x: 1, y: 0 } + Point { x: 2, y: 3 },
        Point { x: 3, y: 3 }
    );
}
//The default generic type in this code is within the Add trait. Here is its definition:

trait Add<Rhs=Self> { //Rhs=Self: this syntax is called default type parameters
    type Output;

    fn add(self, rhs: Rhs) -> Self::Output;
}
```
If we don’t specify a concrete type for Rhs when we implement the Add trait, the type of Rhs will default to Self, which will be the type we’re implementing Add on.
<br/>
When we implemented Add for Point, we used the default for Rhs because we wanted to add two Point instances.<br>
Let’s look at an example of implementing the Add trait where we want to customize the Rhs type rather than using the default.
```rust
//Implementing the Add trait on Millimeters to add Millimeters to Meters
struct Millimeters(u32); //newtype pattern
struct Meters(u32);

impl std::ops::Add<Meters> for Millimeters {
    type Output = Millimeters;

    fn add(self, other: Meters) -> Millimeters {
        Millimeters(self.0 + (other.0 * 1000))
    }
}
//To add Millimeters and Meters, we specify impl Add<Meters> to set the value of the Rhs type parameter instead of using the default of Self.
```
You’ll use default type parameters in two main ways:
- To extend a type without breaking existing code
- To allow customization in specific cases most users won’t need
<br/>

A trait with an associated function and a type with an associated function of the same name that also implements the trait
```rust
trait Animal {
    fn baby_name() -> String;
}

struct Dog;

impl Dog {
    fn baby_name() -> String {
        String::from("Spot")
    }
}

impl Animal for Dog {
    fn baby_name() -> String {
        String::from("puppy")
    }
}

fn main() {
    println!("A baby dog is called a {}", Dog::baby_name());
    //prints: A baby dog is called a Spot
}
```

Attempting to call the baby_name function from the Animal trait, but Rust doesn’t know which implementation to use:
```rust
fn main() {
    println!("A baby dog is called a {}", Animal::baby_name());
    //error[E0790]: cannot call associated function on trait without specifying the corresponding `impl` type.
}
```
To disambiguate and tell Rust that we want to use the implementation of Animal for Dog as opposed to the implementation of Animal for some other type, we need to use fully qualified syntax. 
```rust
fn main() {
    println!("A baby dog is called a {}", <Dog as Animal>::baby_name()); //treat the Dog type as an Animal for this function call 
}
//Using fully qualified syntax to specify that we want to call the baby_name function from the Animal trait as implemented on Dog

//In general, fully qualified syntax is defined as follows:
<Type as Trait>::function(receiver_if_method, next_arg, ...);
```

#### [Using newType pattern to implement External Traits on External Types](https://doc.rust-lang.org/book/ch19-03-advanced-traits.html#using-the-newtype-pattern-to-implement-external-traits-on-external-types)
```rust
//Creating a Wrapper type around Vec<String> to implement Display

use std::fmt;

struct Wrapper(Vec<String>);

impl fmt::Display for Wrapper {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "[{}]", self.0.join(", "))
    }
}

fn main() {
    let w = Wrapper(vec![String::from("hello"), String::from("world")]);
    println!("w = {w}");
}
```
- The downside of using this technique is that Wrapper is a new type, so it doesn’t have the methods of the value it’s holding.
- If we wanted the new type to have every method the inner type has, implementing the [Deref trait](https://doc.rust-lang.org/book/ch15-02-deref.html#treating-smart-pointers-like-regular-references-with-the-deref-trait) on the Wrapper to return the inner type would be a solution.
- If we don’t want the Wrapper type to have all the methods of the inner type—for example, to restrict the Wrapper type’s behavior—we would have to implement just the methods we do want manually.

### Every VTable Includes Drop
Vtable for any trait object includes a pointer for Drop fn for concrete type. (also includes size and alignment)<br>

### Vtable contents:

```markdown
1. methods
2. size
3. alignment
4. Drop
```
<br>
  
```rust
trait Speak {
    fn speak(&self);        
}            

struct Animal {data i32}    
impl Speak for Animal {    
    fn speak(&self) {/**/}    
}

let a = Animal {data:42};
a.speak();

let da = &a as &dyn Speak;
da.speak();
                                    ┌────────────────────┐
                                    │ drop_in_place*     │
                                    ├────────────────────┤
                                    │ size               │
┌──────────────┐                    ├────────────────────┤
│     42       ◄──┐                 │ alignment          │
└──────────────┘  │                 └────────────────────┤
      data        │          ┌──────► speak*             │
                  │          │      └────────────────────┘
                  │          │                            
                  │          │                            
  ┌───────────────┼─────┬────┼────────────────┐           
  │      <value>        │        <vptr>       │           
  └─────────────────────┴─────────────────────┘             
```

<br/>

### HRTB - Higher rank trait bounds - [Rustonomicon](https://doc.rust-lang.org/nomicon/hrtb.html)

---
### References 
##### Book
- [Trait and lifetime bounds](https://doc.rust-lang.org/reference/trait-bounds.html)
- [Impl trait](https://doc.rust-lang.org/reference/types/impl-trait.html)
- [Advanced Traits](https://doc.rust-lang.org/book/ch19-03-advanced-traits.html)
- [Trait object reference](https://doc.rust-lang.org/reference/types/trait-object.html)
- [Trait objects - Book](https://doc.rust-lang.org/book/ch17-02-trait-objects.html#using-trait-objects-that-allow-for-values-of-different-types)
- [Functional features](https://doc.rust-lang.org/book/ch13-00-functional-features.html)
- ['Deref' Trait](https://doc.rust-lang.org/book/ch15-02-deref.html#treating-smart-pointers-like-regular-references-with-the-deref-trait)
- [Special types and traits](https://doc.rust-lang.org/reference/special-types-and-traits.html)
- [Owned trait objects](https://google.github.io/comprehensive-rust/smart-pointers/trait-objects.html)

##### Posts
- [Polymorphism in rust - Matt Oswalt](https://oswalt.dev/2021/06/polymorphism-in-rust/)
- [Catalog of more Rust design patterns](https://rust-unofficial.github.io/patterns/intro.html)
- [Typestate Pattern in Rust](https://cliffle.com/blog/rust-typestate/)
- [Extension Traits in Rust](http://xion.io/post/code/rust-extension-traits.html)

##### Videos: 
- [Dyn vs Static Dispatch - Ryan Levick](https://www.youtube.com/watch?v=tM2r9HD4ivQ)
- [Dispatch & Fat pointers - Jon Gjengset](https://www.youtube.com/watch?v=xcygqF5LVmM)
- [Zero cost abstractions intro - Oliver Jumpertz](https://www.youtube.com/watch?v=MRXi19zQgSo)
- [2 ways to do dynamic dispatch](https://www.youtube.com/watch?v=wU8hQvU8aKM)
- [Typestate pattern -Nazmul Idris](https://www.youtube.com/watch?v=FTSb0dyDOCA)

---
