const RST_ITEMS = [
  "Glass Bottle",
  "Glass Other",
  "Plastic Bottle / Box",
  "Other Plastic",
  "Paper",
  "Cardboard Box",
  "Iron",
  "E-Waste",
  "Wood",
  "Others"
];

const SKS_ITEMS = [
  "Kids Clothes",
  "Kids Shoes",
  "Toys",
  "Sports Items",
  "Adult Clothes",
  "Adult Shoes",
  "Utensils",
  "Furniture",
  "New Stationery",
  "TV",
  "Purifier",
  "Laptop / PC",
  "Microwave / OTG",
  "Others"
];

const PICKUP_MODES = ["Individual", "Drive"];
const DONOR_STATUSES = ["Active", "Pickup Due", "At Risk", "Churned", "Postponed", "Lost"];
const PICKUP_STATUSES = ["Completed", "Postponed", "Pending", "Did Not Open Door"];
const PAYMENT_STATUSES = ["Paid", "Not Paid", "Partially Paid", "Write Off"];
const POSTPONE_REASONS = ["Donor unavailable", "Rescheduled", "PickupPartner unavailable", "Other"];
const LOST_REASONS = ["Not interested", "Shifted", "Society restriction", "No Raddi", "Other"];

module.exports = {
  RST_ITEMS,
  SKS_ITEMS,
  PICKUP_MODES,
  DONOR_STATUSES,
  PICKUP_STATUSES,
  PAYMENT_STATUSES,
  POSTPONE_REASONS,
  LOST_REASONS
};
