import { CancelBooking } from "@/components/booking/CancelBooking";

export default async function CancelPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CancelBooking token={token} />;
}
