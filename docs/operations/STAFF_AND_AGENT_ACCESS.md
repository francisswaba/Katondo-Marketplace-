# Staff and AI-agent access

## Human staff sign-in

Employees use `/admin` and sign in through Katondo's approved OpenID Connect provider. Katondo does not maintain a separate employee password database. The identity provider must issue a stable `sub`, a verified email or phone claim, and one or more server-managed `roles` claims. Keycloak-style `realm_access.roles` is also accepted.

The first top administrator is bootstrapped by assigning `super_administrator` in the identity provider. That role cannot be granted from the Katondo web interface. Removing a role at the identity provider removes the corresponding access on the next token. Staff status can additionally block an otherwise valid identity-provider account.

| Role | Main access |
| --- | --- |
| `super_administrator` | All staff tools, activity settings, event ledger and AI-agent registry |
| `administrator` | Seller review and operations overview |
| `seller_reviewer` | Seller application queue and review actions |
| `customer_support` | Staff workspace shell; support case tools can be added without granting seller or financial access |
| `finance_operator` | Payment and payout overview |
| `fulfilment_operator` | Delivery and fulfilment overview |
| `platform_operator` | Platform-inventory and operations overview |
| `auditor` | Read-only seller, operations, activity and agent-registry visibility |

All staff accounts should use MFA, restricted recovery, short sessions, prompt role removal when employment changes, and periodic access review. Production administrators must use work accounts rather than personal accounts.

All human users, including staff, buyers and sellers, use `/account`. Password, recovery, MFA and verified contact changes open the identity provider's self-service portal configured through `NEXT_PUBLIC_AUTH_ACCOUNT_URL`; Katondo does not receive or store passwords. The Katondo page stores only marketplace preferences such as appearance and role-appropriate notifications. Staff security alerts remain mandatory.

## AI service-agent access

AI agents do not use the interactive website login and must never share a human administrator session. Create a confidential machine-to-machine client in the approved identity provider, configure it to obtain an API token with only the `service_agent` role, then register its public client ID and exact permissions in **Staff workspace → AI service agents**. Store its secret only in the approved secret manager; Katondo does not display or store that credential.

An agent is accepted only when both controls pass: the signed token contains `service_agent`, and the token's `client_id` or `azp` matches an active Katondo registry record. Disabling the registry record immediately blocks new API calls even if the identity-provider credential still exists.

Available permissions are deliberately narrow:

- `catalogue:read`
- `seller_applications:read` — returns a reduced queue without legal name, registration number, email or phone
- `seller_applications:triage` — writes an advisory recommendation for staff review

Agents cannot approve, reject or verify a seller. Human staff remain accountable for those decisions. Add new permissions only with a named owner, a documented purpose, test cases, and a review of the exact data returned.

## Activity collection

Only `super_administrator` can change activity collection. Buyer, seller, staff, AI-agent, security and technical-context collection are separate switches and start disabled. Every settings change is written to an immutable settings history and the existing audit ledger.

The activity ledger records approved event names, actor type, roles, route, subject reference, time and small structured metadata. Technical context is a separate option. When enabled, IP addresses are HMAC-hashed with `ACTIVITY_IP_HASH_SECRET`; the secret must be generated and stored outside Git. A shortened user-agent string is also recorded. Passwords, access tokens, payment credentials, identity documents, message contents and application form-field contents must never be added to event metadata.

The configured retention period is enforced daily and can be 1–365 days. Audit records required for security, legal or financial accountability remain in their dedicated ledgers and are not controlled by the behavioural-activity switch.

Before enabling a category, record its purpose, lawful basis, users covered, event list, recipients, hosting locations and retention period in Katondo's data inventory and public/internal notices. Zambia's Data Protection Act requires lawful, transparent and purpose-limited processing, data minimisation, storage limitation and appropriate security. The DPC's registration guidance also asks controllers to describe stored information, purposes, sharing, transfer and safeguards.

Primary references:

- [Zambia Data Protection Act No. 3 of 2021](https://www.dataprotection.gov.zm/wp-content/uploads/2024/06/Act-No.-3-The-Data-Protection-Act-2021_0-2.pdf)
- [Data Protection Commission quick guide](https://www.dataprotection.gov.zm/wp-content/uploads/2025/03/DATA-PROTECTION-QUICK-GUIDE_2.pdf)
- [Data Protection Commission registration guidance](https://www.dataprotection.gov.zm/registration/)
