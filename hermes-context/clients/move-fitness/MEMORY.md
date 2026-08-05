Client "MOVE Fitness" (MoveVN) is a pilates/cycle studio group in Vietnam. Digital Visions built and runs their booking + operations platform: production at id.movevn.com, staging at staging.movevn.com, marketing site movevn.com. Repo: github.com/digivisions/id.movevn.com. When Andy says "MOVE" or "the app", he means this platform.
§
Stack: Laravel backend + React/Vite web dashboard + Expo React Native mobile app, running as a Docker Compose stack (prod + staging) on ONE VPS. Containers and volumes use the suffix -prod / -staging, NEVER -production: laravel-prod, queue-worker-prod, scheduler-prod, mysql-prod, nginx-prod, redis-prod. Production DB is movedb (not movedb_prod); staging is movedb_stage. Code is served from named volumes, not the image. nginx-prod is the edge for BOTH domains.
§
The ONLY piece still on Hostinger is the marketing site movevn.com (WordPress), slated to migrate onto the same VPS (Andy 2026-08-05, not yet scheduled). Until then movevn.com = Hostinger, id.movevn.com = VPS — don't conflate.
§
Deploys: production ships from the dedicated production branch via a manual "CD - Deploy to Production" workflow. main is stale and diverged — never deploy it. Always restart queue workers after a deploy; long-running queue:work caches classes and will run stale code.
§
Major 2026 workstreams: booking policy and cancellation rules, the trainer payroll engine, off-peak memberships, waitlist promotion, an in-app notifications inbox, and heavy CI/CD + VPS reliability work.
§
Standing rules: NEVER use real client emails for testing — only the four whitelisted test accounts. Prod 500s with an EMPTY laravel.log mean a storage write-permission problem, not an app bug. Secrets leaked in git history are still unrotated — that is the top open security item. Ops detail: the move-fitness-operations skill.
§
Current phase (as of 2026-07-28): production is live and healthy; all agreed requirements are delivered. Status is WAITING ON CUSTOMER PAYMENT — administrative closure, not engineering. Treat any new request as separately scoped work, not unfinished delivery.
