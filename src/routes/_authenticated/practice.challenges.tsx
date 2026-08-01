import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/practice/challenges')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/practice/challenges"!</div>
}
