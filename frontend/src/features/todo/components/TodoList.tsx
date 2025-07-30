"use client";

import { useMemo } from "react";

import { Todo, TodoUpdate } from "@/types/features/todoTypes";

import TodoItem from "./TodoItem";

interface TodoListProps {
  todos: Todo[];
  onTodoUpdate: (todoId: string, updates: TodoUpdate) => void;
  onTodoDelete: (todoId: string) => void;
  onTodoClick?: (todo: Todo) => void;
  onTodoEdit?: (todo: Todo) => void;
  onRefresh?: () => void;
  showCompleted?: boolean;
}

export default function TodoList({
  todos,
  onTodoUpdate,
  onTodoDelete,
  onTodoClick,
  onTodoEdit,
}: TodoListProps) {
  const sortedTodos = useMemo(() => {
    return [...todos].sort((a, b) => Number(a.completed) - Number(b.completed));
  }, [todos]);

  if (sortedTodos.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-foreground-500 sm:min-w-5xl">
        <p className="mb-2 text-lg">No tasks found</p>
        <p className="text-sm">Create a new task to get started</p>
      </div>
    );
  }

  return (
    <div className="flex w-full justify-center">
      <div className="w-full max-w-(--breakpoint-sm) space-y-2 py-4">
        {sortedTodos.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            isSelected={false}
            onUpdate={onTodoUpdate}
            onDelete={onTodoDelete}
            onEdit={onTodoEdit}
            onClick={onTodoClick}
          />
        ))}
      </div>
    </div>
  );
}
