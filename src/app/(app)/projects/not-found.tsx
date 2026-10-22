import { RouteMessage } from "@/components/RouteMessage";

// Shown for projects you can't open: same answer whether it doesn't exist or you're not a member.
export default function ProjectNotFound() {
  return (
    <RouteMessage
      title="Project not found"
      text="This project doesn't exist, or you are not a member of it."
    />
  );
}
