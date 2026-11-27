import BookingClient from "./booking-client";

export default async function BookingPage(props: {
  readonly searchParams?: Promise<{
    readonly practitioner?: string | string[];
    readonly state?: string | string[];
  }>;
}) {
  const params = props.searchParams === undefined ? {} : await props.searchParams;
  const practitioner =
    typeof params.practitioner === "string" ? params.practitioner : undefined;
  const initialPhase = params.state === "calling" ? "calling" : "confirmed";
  return (
    <BookingClient
      initialPractitionerRpps={practitioner}
      initialPhase={initialPhase}
    />
  );
}
