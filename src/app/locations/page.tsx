import { redirect } from "next/navigation";

// Locations now live on the Map page, under the "Locations list" tab.
export default function LocationsPage() {
  redirect("/map?view=list");
}
