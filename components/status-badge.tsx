type Status = "Preparing" | "Ready" | "Completed";

const toneMap: Record<Status, string> = {
  Preparing: "bg-amber-100 text-amber-700",
  Ready: "bg-blue-100 text-blue-700",
  Completed: "bg-green-100 text-green-700",
};

type StatusBadgeProps = {
  status: Status;
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneMap[status]}`}>
      {status}
    </span>
  );
}
