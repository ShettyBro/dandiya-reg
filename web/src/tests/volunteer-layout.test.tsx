import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { VolunteerLayout } from "../routes/volunteer/VolunteerLayout.js";

vi.mock("../lib/hooks/useAuth.js", () => ({
  useAuth: () => ({ user: null, loading: false, login: vi.fn(), logout: vi.fn(), refetch: vi.fn() })
}));

describe("VolunteerLayout", () => {
  it("redirects to the volunteer login page when not authenticated", () => {
    render(
      <MemoryRouter initialEntries={["/vol/home"]}>
        <Routes>
          <Route path="/vol/login" element={<div>Login screen</div>} />
          <Route element={<VolunteerLayout />}>
            <Route path="/vol/home" element={<div>Home screen</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login screen")).toBeTruthy();
    expect(screen.queryByText("Home screen")).toBeNull();
  });
});
