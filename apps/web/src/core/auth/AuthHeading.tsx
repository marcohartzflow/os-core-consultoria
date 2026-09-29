/** Title block of the public screens (login, invitation, password reset). */
export function AuthHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-2 text-center">
      <h1 className="text-3xl font-medium">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
