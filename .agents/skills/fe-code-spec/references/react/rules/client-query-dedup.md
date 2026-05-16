---
title: Use Query Cache for Automatic Deduplication
impact: MEDIUM-HIGH
impactDescription: automatic request deduplication
tags: client, react-query, ahooks, deduplication, data-fetching
---

## Use Query Cache for Automatic Deduplication

Use the project's query/cache layer to share request results across component instances. In this repository that usually means React Query, ahooks, or an existing request hook around ConnectRPC/BAM/request.

**Incorrect (no deduplication, each instance fetches):**

```tsx
const UserList = () => {
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    requestUsers()
      .then(setUsers)
  }, [])

  return <UserTable users={users} />
}
```

**Correct (multiple instances share one request):**

```tsx
export const useUsers = () => {
  return useQuery({
    queryKey: ['users'],
    queryFn: requestUsers,
  })
}

const UserList = () => {
  const { data = [] } = useUsers()
  return <UserTable users={data} />
}
```

**For immutable or rarely changing data:**

```tsx
export const useStaticConfig = () =>
  useQuery({
    queryKey: ['static-config'],
    queryFn: requestStaticConfig,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1_000,
  })
```

**For mutations:**

```tsx
export const useUpdateUser = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
```

Search the current project first and follow its established query key and hook conventions before adding a new request abstraction.
