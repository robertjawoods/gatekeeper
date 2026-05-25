// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { siteConfig } from './src/config/site';

// https://astro.build/config
export default defineConfig({
	site: siteConfig.siteUrl,
	vite: {
		preview: {
			allowedHosts: ['gatekeeper-web.up.railway.app'],
		},
	},
	integrations: [
		starlight({
			title: siteConfig.title,
			description: siteConfig.tagline,
			components: {
				Footer: './src/components/Footer.astro',
			},
			social: [{ icon: 'github', label: 'GitHub', href: siteConfig.repositoryUrl }],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Overview', slug: 'getting-started/overview' },
						{ label: 'Install', slug: 'getting-started/install' },
						{ label: 'First Trial Walkthrough', slug: 'getting-started/first-trial' },
					],
				},
				{
					label: 'Commands',
					items: [{ autogenerate: { directory: 'commands' } }],
				},
				{
					label: 'Workflows',
					items: [{ autogenerate: { directory: 'workflows' } }],
				},
				{
					label: 'Reference',
					items: [{ autogenerate: { directory: 'reference' } }],
				},
				{ label: 'FAQ', slug: 'faq' },
				{ label: 'Changelog', slug: 'changelog' },
			],
			head: [{ tag: 'meta', attrs: { name: 'theme-color', content: '#111827' } }],
		}),
	],
});
