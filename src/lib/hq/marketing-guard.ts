import "server-only";
import { redirect } from "next/navigation";
import { requireModule } from "../desk/auth";
import { marketingTabsFor } from "./access";

/** For the dashboard tabs: someone whose Marketing is only Publicity is sent there. */
export async function requireMarketingDashboard() {
  const user = await requireModule("marketing");
  const tabs = marketingTabsFor(user.roles);
  if (tabs && !tabs.includes("overview")) redirect("/savvy-hq/marketing/publicity");
  return user;
}
