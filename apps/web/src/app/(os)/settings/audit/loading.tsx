import { ListPageSkeleton } from "@/core/ui/page-skeleton";

export default function Loading() {
  return <ListPageSkeleton columns={5} action={false} />;
}
