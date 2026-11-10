# TrueLook luxury admin update

User requested implementation across every administration section, continuing the approved Champagne Editorial direction.

Scope: shared desktop/mobile navigation, page header, dashboard metrics/charts/recent orders/low stock, products table/grid/create/edit/detail/images/variants/stock, categories hierarchy/forms, orders/detail/status/export, customers/detail/history, account/security settings and shared pagination. Preserve all existing API payloads, access guards, stock reservations, payment transitions and form validation.

Design: warm off-white workspace, white surfaces, charcoal UI text, champagne gold accents and hairlines. Serif page titles and sans-serif operational headings/data. Flat 4px surfaces, deliberate whitespace, clear keyboard focus, distinct semantic status colors, responsive mobile navigation and horizontally scrollable tables.

Implementation: scoped admin styles plus direct component/route styling updates. No backend changes and no new packages. Validate using existing admin flow/session/stock/image/category/order tests, TypeScript, lint and production build.
