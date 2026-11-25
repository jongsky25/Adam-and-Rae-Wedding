/*
 * Adam & Rae photo share settings.
 * After deploying the Google Apps Script, paste its Web app URL (ends in /exec)
 * between the quotes on the next line. Leave it empty to keep preview mode.
 */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyZuOam_9346FDhT3z28KG9Di4iGhuQF1A2zAOtH3Sg3YCD4wTB_1KzdLM3XBYoym5R/exec";

const CONFIG = {
  scriptUrl: SCRIPT_URL,
  couple: "Adam & Rae",
  dateLine: "28.11.26",
  reward: "free Stuffy Cute Charm",
  station: "Stuffy Cute Charms booth",
  minFiles: 1,          // photos/videos needed before a claim slip is issued
  maxVideoMB: 35,       // Apps Script accepts about 50 MB per upload
  maxImageSide: 2560    // photos are resized to this before upload
};
