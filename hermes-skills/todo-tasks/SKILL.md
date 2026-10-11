---
name: todo-tasks
description: Create tasks in the user's local TODO lists in Derp Media Server. Use when the user asks to add, create, or remember a task, to-do, or reminder.
---

# TODO tasks

The user's TODO lists live in Derp Media Server, which runs locally (default
`http://localhost:3000`). Always add tasks through its HTTP API rather than editing files,
so open browser tabs update immediately.

## See which lists exist

```bash
curl -s http://localhost:3000/api/todo/lists
```

Returns `{"folder":"thoughts/TODO","lists":[{"name":"work","path":"thoughts/TODO/work.todo.json","open":3,"done":1}]}`.

Pick the list that matches the user's words ("work", "home", ...). If none fits, ask which
list to use; a new name creates a new list.

## Add a task

```bash
curl -s -X POST http://localhost:3000/api/todo/tasks \
  -H 'Content-Type: application/json' \
  -d '{"list":"work","title":"Prepare demo","description":"Slides and a short script","due":"2026-10-05T14:00","remind":true,"checklist":["Slides","Rehearse"]}'
```

| Field         | Required | Notes                                                                  |
| ------------- | -------- | ---------------------------------------------------------------------- |
| `list`        | yes      | List name (`work`) or full path ending in `.todo.json`                 |
| `title`       | yes      | Short task title                                                       |
| `description` | no       | Notes                                                                  |
| `due`         | no       | Start time in the user's local time, `YYYY-MM-DDTHH:mm`                |
| `remind`      | no       | `true` to show a reminder one hour before `due`; ignored without `due` |
| `checklist`   | no       | Array of strings                                                       |

Resolve relative dates ("tomorrow at 3") against today's date before sending. Only set
`remind` when the user asks for a reminder or the task has a meaningful start time.

After adding, confirm in one line: the list, the title, and the date if any.
