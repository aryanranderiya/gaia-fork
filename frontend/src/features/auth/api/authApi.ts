import { apiService } from "@/lib/api";

export interface UserInfo {
  name: string;
  email: string;
  picture: string;
  onboarding?: {
    completed: boolean;
    completed_at?: string;
    preferences?: {
      country?: string;
      profession?: string;
      response_style?: string;
      custom_instructions?: string;
    };
  };
}

export interface GoogleLoginResponse {
  url: string;
}

export const authApi = {
  // Fetch current user info
  fetchUserInfo: async (): Promise<UserInfo> => {
    return apiService.get<UserInfo>("/oauth/me", {
      silent: true,
    });
  },

  // Initiate Google login
  googleLogin: async (): Promise<GoogleLoginResponse> => {
    return apiService.get<GoogleLoginResponse>("/oauth/login/google", {
      errorMessage: "Failed to initiate Google login",
    });
  },

  // Update user profile (name/picture)
  updateProfile: async (formData: FormData): Promise<UserInfo> => {
    return apiService.patch<UserInfo>("/oauth/me", formData, {
      successMessage: "Profile updated successfully",
      errorMessage: "Failed to update profile",
    });
  },

  // Update user name only
  updateName: async (name: string): Promise<UserInfo> => {
    const formData = new FormData();
    formData.append("name", name);
    return apiService.patch<UserInfo>("/oauth/name", formData, {
      successMessage: "Name updated successfully",
      errorMessage: "Failed to update name",
    });
  },

  // Logout user
  logout: async (): Promise<void> => {
    return apiService.post("/oauth/logout", undefined, {
      successMessage: "Logged out successfully",
      errorMessage: "Failed to logout",
    });
  },

  // Complete onboarding
  completeOnboarding: async (onboardingData: {
    name: string;
    country: string;
    profession: string;
    response_style: string;
    instructions?: string | null;
  }): Promise<{ success: boolean; message: string; user?: UserInfo }> => {
    return apiService.post("/oauth/onboarding", onboardingData, {
      successMessage: "Welcome! Your preferences have been saved.",
      errorMessage: "Failed to complete onboarding",
    });
  },

  // Update user preferences
  updatePreferences: async (preferences: {
    country?: string;
    profession?: string;
    response_style?: string;
    custom_instructions?: string | null;
  }): Promise<{ success: boolean; message: string; user?: UserInfo }> => {
    return apiService.patch("/oauth/onboarding/preferences", preferences, {
      silent: true,
    });
  },
};
