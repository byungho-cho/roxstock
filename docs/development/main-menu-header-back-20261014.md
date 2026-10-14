# Main menu headers · V 1.0.33

PageHeader previously inferred back visibility solely from backPath/onBack. Menu-entry pages already supplied return-to-home/more callbacks, so they displayed detail arrows. This was existing page/header behavior, not a newly added arrow in phase31.

Menu paths now come from appMenuItems and /more: no back icon or matching spacer at the first screen. Child views on the same path explicitly opt in (financial/value detail, chart, cash input, settings child, compound compare/goal/form, journal profit, linked stock/analysis profit). Stock child paths and settings monitoring keep their existing back actions. Main paths with legacy /detail prefixes are still main screens. Value cover detail also returns to its list and chart returns to detail.

Cover/tablet/larger viewport tests visit every menu entry and verify absent arrows, visible headings/footer; settings, financial and stock child screens retain back navigation. Existing phase31 and navigation regressions remain required. Additional code release: V 1.0.33. Work branch → required checks → merge → deployment start; no APK changes.
