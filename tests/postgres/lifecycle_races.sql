\set ON_ERROR_STOP on
INSERT INTO infinitex_harness.tasks
(owner_subject,task_id,status,task_version,event_seq,fencing_token,payload_hash)
VALUES ('owner-race','claim-race','awaiting_approval',0,0,0,repeat('9',64));
SELECT infinitex_harness.approve_and_issue_grant(
 'owner-race','claim-race',0,'66666666-6666-4666-8666-666666666666',
 repeat('e',64),clock_timestamp()+interval '5 minutes');
