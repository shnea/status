INSERT INTO members(id,issuer,subject,display_name,ai_allowed) VALUES
('11111111-1111-4111-8111-111111111111','https://backup.example.invalid','synthetic-owner','백업 검사 사용자',false);
INSERT INTO uploaded_files(id,member_id,original_name,media_type,size,unreferenced_since,cleanup_attempts,cleanup_error) VALUES
('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','synthetic-only.png','image/png',128,NULL,0,NULL);
INSERT INTO portfolios(id,member_id,slug,draft,draft_revision,published,published_revision,is_public) VALUES
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','backup-fixture',
'{"profile":{"name":"초안 검사","title":"백업 메인 타이틀","bannerImageId":"22222222-2222-4222-8222-222222222222","about":{"type":"doc","content":[{"type":"paragraph","attrs":{"hidden":true},"content":[{"type":"text","text":"숨긴 자기소개 백업 확인"}]}]},"imageId":"22222222-2222-4222-8222-222222222222"},"template":"premium-dark","projects":[{"id":"fixture-project","visible":false,"title":"숨긴 프로젝트"}]}'::jsonb,
7,'{"profile":{"name":"공개 검사"},"template":"swiss"}'::jsonb,5,true);
INSERT INTO portfolio_publications(portfolio_id,revision) VALUES ('33333333-3333-4333-8333-333333333333',5);
INSERT INTO slug_aliases(slug,portfolio_id) VALUES ('backup-old','33333333-3333-4333-8333-333333333333');
INSERT INTO file_upload_requests(request_id,member_id,original_name,sha256,media_type,kind,size,file_id) VALUES
('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','synthetic-only.png',repeat('0',64),'image/png','image',128,'22222222-2222-4222-8222-222222222222');
INSERT INTO system_settings(key,value) VALUES ('backup_fixture','{"label":"백업 설정 검사"}');
