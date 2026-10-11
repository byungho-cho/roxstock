BEGIN { print "DELIMITER $$"; block=0 }
{
  line=$0
  sub(/^CREATE TABLE /,"CREATE TABLE IF NOT EXISTS ",line)
  if (line ~ /^INSERT INTO account_profit_revisions\(account_id\) SELECT id FROM accounts;/)
    sub(/^INSERT INTO /,"INSERT IGNORE INTO ",line)
  if (line ~ /^CREATE TRIGGER /) {
    sub(/^CREATE TRIGGER /,"CREATE TRIGGER IF NOT EXISTS ",line)
    block=(line ~ / BEGIN$/)
  }
  if (block && line ~ /^END;$/) { sub(/;$/,"$$",line); block=0 }
  else if (!block) sub(/;$/,"$$",line)
  print line
}
END {
  print "INSERT IGNORE INTO account_profit_revisions(account_id) SELECT id FROM accounts$$"
  print "DELIMITER ;"
}
