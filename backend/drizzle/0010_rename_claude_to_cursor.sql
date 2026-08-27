-- Custom SQL migration file, put your code below! --
UPDATE skills SET target_format = 'cursor' WHERE target_format = 'claude';