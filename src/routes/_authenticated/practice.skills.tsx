import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/practice/skills')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/practice/skills"!</div>
}
