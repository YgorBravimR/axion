---
name: nextjs-app-router-component-architecture
description: Next.js App Router component architecture patterns. Use when deciding between server and client components, implementing container-presentational patterns, or organizing component hierarchies. Covers server/client boundaries, data fetching strategies, and composition patterns for App Router applications.
---

# Next.js App Router Component Architecture

Architectural patterns for organizing server and client components in Next.js App Router applications.

## When to Apply

- Deciding between server vs client components in App Router
- Implementing container-presentational patterns with RSC
- Organizing component hierarchies for optimal performance
- Migrating from Pages Router component patterns

## Critical Rules

**Server Component by Default**: Start with server components and add "use client" only when needed

```jsx
// WRONG - unnecessary client component
"use client"
export default function ProductList({ products }) {
  return (
    <div>
      {products.map(product => (
        <div key={product.id}>{product.name}</div>
      ))}
    </div>
  )
}

// RIGHT - server component for static content
export default function ProductList({ products }) {
  return (
    <div>
      {products.map(product => (
        <div key={product.id}>{product.name}</div>
      ))}
    </div>
  )
}
```

**Client Boundary Placement**: Push "use client" as deep as possible in component tree

```jsx
// WRONG - entire page becomes client component
"use client"
export default function ProductPage() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <ProductDetails product={product} />
      <button onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </div>
  )
}

// RIGHT - only interactive part is client component
export default function ProductPage() {
  return (
    <div>
      <ProductDetails product={product} />
      <CounterButton />
    </div>
  )
}

function CounterButton() {
  "use client"
  const [count, setCount] = useState(0)
  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  )
}
```

## Key Patterns

### Container-Presentational with Server Components

```jsx
// Server container - handles data fetching
async function ProductContainer({ id }) {
	const product = await fetch(`/api/products/${id}`)
	const reviews = await fetch(`/api/products/${id}/reviews`)

	return <ProductView product={product} reviews={reviews} />
}

// Presentational component - pure rendering
function ProductView({ product, reviews }) {
	return (
		<div>
			<h1>{product.name}</h1>
			<p>{product.description}</p>
			<ReviewsList reviews={reviews} />
			<AddToCartButton productId={product.id} />
		</div>
	)
}
```

### Client Islands Pattern

```jsx
// Server component wrapper
export default function Dashboard() {
	return (
		<div>
			<StaticHeader />
			<UserStats /> {/* Server component */}
			<InteractiveChart /> {/* Client component */}
			<StaticFooter />
		</div>
	)
}

// Client island for interactivity
;("use client")
function InteractiveChart() {
	const [filter, setFilter] = useState("monthly")
	// Chart interactivity logic
}
```

### Data Fetching Composition

```jsx
// Parallel data fetching in server components
async function DashboardPage() {
	const userPromise = getUser()
	const statsPromise = getStats()
	const reportsPromise = getReports()

	return (
		<div>
			<UserProfile userPromise={userPromise} />
			<StatsWidget statsPromise={statsPromise} />
			<ReportsTable reportsPromise={reportsPromise} />
		</div>
	)
}

// Suspense boundary for each data dependency
function UserProfile({ userPromise }) {
	return (
		<Suspense fallback={<UserSkeleton />}>
			<UserData userPromise={userPromise} />
		</Suspense>
	)
}
```

### Server Actions with Client Components

```jsx
// Server action definition
async function updateProduct(formData) {
	"use server"
	const id = formData.get("id")
	const name = formData.get("name")
	await updateProductInDB(id, { name })
}

// Client component consuming server action
;("use client")
function ProductForm({ product, updateProduct }) {
	return (
		<form action={updateProduct}>
			<input name="id" value={product.id} type="hidden" />
			<input name="name" defaultValue={product.name} />
			<button type="submit">Update</button>
		</form>
	)
}
```

## Common Mistakes

- **Making entire pages client components** — Use "use client" only for interactive parts
- **Passing server-only values to client components** — Database connections, API keys will cause hydration errors
- **Fetching data in client components unnecessarily** — Prefer server component data fetching when possible
- **Not using Suspense boundaries** — Missing loading states for async server components
