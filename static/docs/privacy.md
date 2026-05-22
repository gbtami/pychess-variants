# Privacy Policy

_Last updated: May 22, 2026_

This Privacy Policy explains how pychess.org (“pychess.org”, “we”, “us”) collects, uses, stores, and protects information when you use our website and services.

pychess.org is an open-source online chess variants server. It allows users to play real-time and correspondence chess variant games, use public and private chat features, participate in site activity, and sign in using third-party OAuth providers. This document is intended to be a clear, practical privacy notice. It does not override your rights under applicable data protection law, including the General Data Protection Regulation (GDPR), where it applies.

## 1. Contact

For privacy questions, account deletion requests, or other data protection requests, contact us at:

**[Contact page](/contact)**

If pychess.org is operated by an individual maintainer or informal open-source team rather than a company or registered organization, this contact address is the practical contact point for privacy matters.

## 2. What information we collect

We try to collect and store only the information needed to operate the service.

Depending on how you use pychess.org, we may process the following categories of information:

### Account and login information

When you sign in, we use third-party OAuth providers such as lichess, lishogi, Discord, or Google.

We may store:

- your pychess.org username or profile name;
- your selected login provider;
- a stable OAuth identifier from that provider;
- public profile information provided by the login provider, if needed for the service;
- account preferences and settings.

We do not intentionally require users to provide a real name, postal address, or email address to create a pychess.org profile.

In the current server implementation, for persistent account authentication/linking we store only:

- the selected OAuth provider;
- a stable provider user identifier (`oauth_id`);
- your pychess username;
- the provider-reported title where applicable.

During OAuth login/signup flow, we may also process temporary session fields (for example provider username and OAuth flow values) to complete registration and account linking. These temporary session values are cleared after the flow completes.

For login checks, the server may read additional provider flags such as account status fields (for example closed-account or ToS-violation indicators) and then discard the OAuth access token after fetching account data.

Current OAuth scopes are configured as:

- Lichess/Lishogi: account API access with provider-defined defaults;
- Discord: `identify`;
- Google: `openid` and `userinfo.profile` (no email scope).

### Game and site activity

We may store information related to use of the chess service, including:

- games, moves, positions, clocks, results, variants, and game metadata;
- ratings, performance statistics, tournament participation, and standings;
- public profile information and public activity;
- public chat messages;
- puzzle or analysis activity, if applicable;
- reports, moderation actions, warnings, restrictions, or bans.

Game records, moves, results, ratings, and public activity may be visible to other users and may remain part of the public chess archive.

### Private messages and chat

If private chat or personal messaging is available, we may store messages sent between users.

Private messages are visible to the sender and recipient. They may also be accessed by administrators or moderators when necessary for abuse reports, moderation, security, debugging, or legal reasons.

Private messages are not intended for sensitive personal information.

### Technical information and logs

When you use the service, we may process technical information such as:

- IP address;
- browser and device information;
- request timestamps;
- session identifiers;
- authentication/session cookies;
- server logs;
- error logs;
- security and abuse-prevention logs.

This information is used to operate, secure, debug, and improve the service.

## 3. Why we use this information

We use information for the following purposes:

- to let users sign in and maintain their account/session;
- to operate real-time and correspondence games;
- to provide ratings, tournaments, game archives, chat, and other site features;
- to display public profiles, games, and activity;
- to prevent spam, abuse, cheating, harassment, and security attacks;
- to investigate reports and enforce site rules;
- to debug, maintain, and improve the service;
- to communicate with users about privacy, moderation, or support requests;
- to comply with legal obligations where required.

## 4. Legal basis under GDPR

Where the GDPR applies, we rely on the following legal bases:

- **Performance of a service:** for account login, sessions, games, ratings, tournaments, chat, preferences, and other features requested by users.
- **Legitimate interests:** for security, abuse prevention, moderation, debugging, service reliability, and maintaining the integrity of the game archive.
- **Legal obligation:** where we must process or retain information to comply with applicable law or valid legal requests.
- **Consent:** where we introduce optional processing that requires consent under applicable law.

## 5. Public information

Some information on pychess.org is public by design.

This may include:

- username/profile name;
- public profile information;
- public games, moves, results, ratings, and tournaments;
- public chat messages;
- public studies, analyses, puzzles, or other public content, if available.

Please do not publish personal or sensitive information in public areas of the site.

## 6. Private messages and moderation

Private messages are intended to be private between the participants, but they are not end-to-end encrypted unless explicitly stated otherwise.

Administrators or moderators may access private messages or related metadata when necessary to:

- investigate abuse reports;
- prevent harassment, spam, cheating, or illegal activity;
- protect users and the service;
- debug technical issues;
- respond to legal obligations.

We may restrict, hide, delete, or preserve messages when needed for moderation, safety, or legal reasons.

## 7. Cookies and local storage

We use cookies and similar browser storage where needed for:

- login and session security;
- remembering preferences;
- preventing abuse;
- operating the site correctly.

These are generally necessary for the service to work.

We do not use advertising cookies.

If we add optional analytics, tracking, or advertising cookies in the future, we will update this policy and ask for consent where required by law.

In the current implementation:

- we use encrypted session cookies for authentication/session handling;
- we set a browser fingerprint signal cookie (`pcfp`) used for abuse-prevention signals;
- we use local storage and session storage for UI/game preferences and anti-cheat/session coordination;
- we do not use advertising cookies.

## 8. Third-party services

We use third-party services to operate pychess.org.

These may include:

- hosting and infrastructure providers, including Heroku (EU region);
- database providers, including DigitalOcean-managed MongoDB (EU region);
- logging/monitoring providers used by our deployment platform and operational stack;
- OAuth login providers, such as lichess, lishogi, Discord, and Google;
- community platforms, including our Discord server integration used to relay public lobby chat messages in both directions (pychess.org lobby -> Discord and Discord -> pychess.org lobby);
- open-source software and dependencies used to run the service.

When you sign in through an OAuth provider, that provider may process your data under its own privacy policy. We do not control those providers’ privacy practices.
If Discord relay is enabled, relayed messages are also subject to Discord's own terms, privacy policy, and retention practices.

## 9. International transfers

Some service providers may process information outside the European Economic Area.

Where required, we rely on appropriate safeguards, such as provider data-processing terms, standard contractual clauses, or other lawful transfer mechanisms.

We do not sell users’ personal data.

## 10. How long we keep information

We keep information only for as long as needed for the purposes described in this policy, unless a longer period is required for legal, security, or moderation reasons.

Current retention rules:

- **Session cookies:** kept until logout, expiry, or deletion by the browser.
- **Technical logs:** kept for a limited period based on platform/provider retention and operational needs.
- **Public games, moves, results, ratings, and public activity:** may be kept indefinitely as part of the public chess archive.
- **Public chat:** currently stored as a capped history (latest ~100 lobby lines), with older lines rolling out automatically.
- **Private messages:** currently have no automatic expiry in application code; user-side delete hides messages for that user, while moderation/legal records may be retained.
- **Moderation and abuse-prevention records:** may be kept as long as necessary to protect the service and users.
- **Closed or deleted accounts:** account access may be disabled and profile information may be deleted or anonymized, but public games and related public records may remain in the archive.

If configured by operators, public lobby chat may be relayed to and from external community channels (for example Discord), where separate platform retention and policies apply.

## 11. Account deletion and data requests

Where available, you can use these self-service account tools:

- **Export personal data:** `/account/personal-data`
- **Close account:** `/account/close` (disables account access; self-closed accounts may be reopenable)
- **Delete account (GDPR erase):** `/account/delete` (irreversible account-level erasure/anonymization flow)

Game archive export is separate from personal data export and is available from your profile PGN export.

You may also contact us to request:

- access to personal data we hold about you;
- correction of inaccurate information;
- deletion of your account or certain personal data;
- restriction of processing;
- objection to processing based on legitimate interests;
- export of information, where applicable;
- withdrawal of consent, where processing is based on consent.

Some information may not be fully deleted if it is necessary to preserve the integrity of public game archives, prevent abuse, comply with legal obligations, or protect the rights of others. In such cases, we may delete, anonymize, restrict, hide, or separate account-related information where appropriate.

To make a request, contact:

**[Contact page](/contact)**

We may need to verify that the request comes from the relevant account holder.

## 12. Security

We use reasonable technical and organizational measures to protect the service and user information.

However, no online service can be guaranteed to be completely secure. Users should use the site responsibly and avoid sharing sensitive personal information in chats or public areas.

## 13. Children

pychess.org is a general online chess service and is not specifically directed at young children.

If you believe a child has provided personal information in a way that requires action under applicable law, contact us at:

**[Contact page](/contact)**

## 14. Changes to this policy

We may update this Privacy Policy from time to time.

When we make significant changes, we will update the “Last updated” date and, where appropriate, provide notice on the site.

## 15. Complaints

If you are in the European Union or European Economic Area, you may have the right to lodge a complaint with your local data protection authority.

If pychess.org is operated from Hungary, the relevant authority may be the Hungarian National Authority for Data Protection and Freedom of Information (NAIH).

We encourage users to contact us first so we can try to resolve the issue.
