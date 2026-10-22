import { RouteMessage } from "@/components/RouteMessage";

// An issue (or settings page) that isn't there; the project header stays.
export default function ProjectPageNotFound() {
  return (
    <RouteMessage
      title="Page not found"
      text="This issue doesn't exist, or you don't have access to this page."
    />
  );
}
