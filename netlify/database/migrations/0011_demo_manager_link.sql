-- A fixed back-office link for the fictional Sora Bistro, like the demo
-- hostess links of 0005 (18 Nov 2026): the back office can be shown at a
-- meeting with a venue without opening the admin. Fictional data only; it
-- goes away with the demo venues before launch.
update venues set manager_token = 'demo-manager-sora-bistro-0003'
where id = 'cccccccc-0003-4ccc-8ccc-000000000003';
