/*
import puppeteer from 'puppeteer'; // Standard package only

export async function autoAuthorizeBot(serverId) {
    console.warn("Auto Joiner is disabled in this build to save space.");
    return { success: false, error: "Puppeteer removed." };
}
*/
// Dummy export to keep file valid if imported elsewhere (though it seems unused)
export async function autoAuthorizeBot(serverId) {
    console.warn("❌ Auto Joiner requires Puppeteer, which is removed for lightweight hosting.");
    return { success: false, error: "Puppeteer not installed." };
}
