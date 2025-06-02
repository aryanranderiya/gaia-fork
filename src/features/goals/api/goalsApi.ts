import { apiService } from "@/lib/api";
import { Goal, GoalCreate, GoalUpdate } from "@/types/api/goalsApiTypes";

export const goalsApi = {
  // Fetch all goals
  fetchGoals: async (): Promise<Goal[]> => {
    return apiService.get<Goal[]>("/goals", {
      errorMessage: "Failed to fetch goals",
    });
  },

  // Fetch single goal by ID
  fetchGoalById: async (id: string): Promise<Goal> => {
    return apiService.get<Goal>(`/goals/${id}`, {
      errorMessage: "Failed to fetch goal",
    });
  },

  // Create a new goal
  createGoal: async (goal: GoalCreate): Promise<Goal> => {
    return apiService.post<Goal>("/goals", goal, {
      successMessage: "Goal created successfully!",
      errorMessage: "Failed to create goal. Please try again later.",
    });
  },

  // Update a goal
  updateGoal: async (id: string, goal: GoalUpdate): Promise<Goal> => {
    return apiService.put<Goal>(`/goals/${id}`, goal, {
      successMessage: "Goal updated successfully!",
      errorMessage: "Failed to update goal",
    });
  },

  // Delete a goal
  deleteGoal: async (id: string): Promise<void> => {
    return apiService.delete(`/goals/${id}`, {
      successMessage: "Goal deleted successfully!",
      errorMessage: "Failed to delete goal",
    });
  },
};
