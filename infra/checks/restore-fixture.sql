DO $$
BEGIN
  IF (SELECT count(*) FROM members) <> 1 OR (SELECT display_name FROM members) <> '백업 검사 사용자' THEN
    RAISE EXCEPTION 'Member data was not restored';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM portfolios WHERE slug='backup-fixture' AND draft_revision=7 AND published_revision=5 AND is_public
    AND draft #>> '{profile,name}'='초안 검사'
    AND draft #>> '{profile,about,content,0,content,0,text}'='숨긴 자기소개 백업 확인'
    AND draft #>> '{projects,0,visible}'='false'
    AND draft #>> '{profile,title}'='백업 메인 타이틀'
    AND draft #>> '{profile,bannerImageId}'='22222222-2222-4222-8222-222222222222'
    AND draft #>> '{template}'='premium-dark'
    AND published #>> '{profile,name}'='공개 검사'
    AND published #>> '{template}'='swiss') THEN
    RAISE EXCEPTION 'Draft, hidden data or published snapshot was not restored';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM uploaded_files WHERE original_name='synthetic-only.png' AND size=128 AND unreferenced_since IS NULL AND cleanup_attempts=0) THEN
    RAISE EXCEPTION 'Attachment reference state was not restored';
  END IF;
  IF (SELECT count(*) FROM file_upload_requests) <> 1 OR (SELECT count(*) FROM portfolio_publications) <> 1
    OR (SELECT count(*) FROM slug_aliases WHERE slug='backup-old') <> 1 THEN
    RAISE EXCEPTION 'Upload deduplication, publications or old addresses were not restored';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM system_settings WHERE key='backup_fixture' AND value->>'label'='백업 설정 검사') THEN
    RAISE EXCEPTION 'System setting was not restored';
  END IF;
  IF (SELECT count(*) FROM icon_catalog) < 3000 OR (SELECT count(*) FROM skill_dictionary WHERE owner_id IS NULL) < 3000 THEN
    RAISE EXCEPTION 'Skill catalog was not restored';
  END IF;
END $$;
