import ServicePage from "../[id]/page";

export default function NewServicePage() {
  return ServicePage({ params: Promise.resolve({ id: "new" }) });
}
