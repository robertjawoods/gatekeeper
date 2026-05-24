export const siteConfig = {
	title: "Gatekeeper",
	tagline: "Guide your guild through member trials with clear steps, shared feedback, and confident final decisions.",
	repositoryUrl: "https://github.com/GatekeeperInc/gatekeeper",
	supportUrl: "https://github.com/GatekeeperInc/gatekeeper/issues",
	discordClientId: "1504236836547989631",
	oauthScopes: ["bot", "applications.commands"],
	permissions: "268520448",
};

export function buildInstallUrl(clientId = siteConfig.discordClientId): string {
	const params = new URLSearchParams({
		client_id: clientId,
		permissions: siteConfig.permissions,
		scope: siteConfig.oauthScopes.join(" "),
	});

	return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}
