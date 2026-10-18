function Read-ExchangeEvidence([string]$Key){
    $records=[Collections.Generic.List[object]]::new();$began=[datetime]::UtcNow.ToString('o');$state='complete';$errorText=$null
    try{
        switch($Key){
            transportRules {Get-TransportRule -ErrorAction Stop | ForEach-Object {$records.Add($_)}}
            messageTrace {
                $from=[datetime]$start;$until=[datetime]$end
                $oldest=[datetime]::UtcNow.AddDays(-90)
                if($from -lt $oldest){$from=$oldest;$state='partial';$errorText='Message trace only queried the available 90-day window.'}
                while($from -lt $until){
                    $to=$from.AddDays(9);if($to -gt $until){$to=$until}
                    $directions=if($plan.scope -eq 'user'){@('SenderAddress','RecipientAddress')}else{@('tenant')}
                    foreach($direction in $directions){
                        $args=@{StartDate=$from;EndDate=$to;ResultSize=5000;ErrorAction='Stop'}
                        if($direction -ne 'tenant'){$args[$direction]=$upn}
                        $lastCursor=''
                        do{
                            $batch=@(Get-MessageTraceV2 @args)
                            foreach($row in $batch){$records.Add($row)}
                            Save-Source $Key $records.ToArray() @{state='running';startedAt=$began;note='Message trace: time slices and recipient/time continuation'}
                            if($batch.Count -eq 5000){
                                $last=$batch[-1];$cursor=([datetime]$last.Received).ToString('o')+'|'+$last.RecipientAddress
                                if($cursor -eq $lastCursor){throw 'Message trace continuation did not advance'}
                                $lastCursor=$cursor;$args.EndDate=[datetime]$last.Received;$args.StartingRecipientAddress=[string]$last.RecipientAddress
                            }
                        }while($batch.Count -eq 5000)
                    }
                    $from=$to
                }
            }
            {$_ -in @('adminAudit','mailboxAudit')} {
                if(!(Get-Command Search-UnifiedAuditLog -ErrorAction SilentlyContinue)){throw 'Search-UnifiedAuditLog is not available to this Exchange session. Check the Audit Logs or View-Only Audit Logs role for this operator/application.'}
                $types=if($Key -eq 'adminAudit'){@('ExchangeAdmin')}else{@('ExchangeItem','ExchangeItemGroup','ExchangeItemAggregated')}
                $seen=[Collections.Generic.HashSet[string]]::new()
                foreach($type in $types){
                    $from=[datetime]$start
                    while($from -lt [datetime]$end){
                        $to=$from.AddDays(1);if($to -gt [datetime]$end){$to=[datetime]$end}
                        $args=@{StartDate=$from;EndDate=$to;RecordType=$type;SessionId=[guid]::NewGuid().ToString();SessionCommand='ReturnLargeSet';ResultSize=5000;ErrorAction='Stop'}
                        # Search the time/type slice, then match mailbox owner locally. UserIds
                        # selects the actor and would miss delegate/admin actions on the mailbox.
                        $scanned=0;$pageSignatures=[Collections.Generic.HashSet[string]]::new()
                        do{
                            $batch=@(Search-UnifiedAuditLog @args)
                            if(!$batch.Count){break}
                            $signature=($batch | ForEach-Object {[string]$_.Identity+'|'+[string]$_.AuditData}) -join "`n"
                            if(!$pageSignatures.Add($signature)){throw 'Unified audit pagination repeated a page; coverage is incomplete.'}
                            $scanned+=$batch.Count
                            foreach($row in $batch){
                                $data=$row.AuditData|ConvertFrom-Json -ErrorAction Stop
                                $match=$plan.scope -eq 'tenant'
                                if(!$match -and $Key -eq 'mailboxAudit'){$match=[string]$data.MailboxOwnerUPN -ieq $upn}
                                if(!$match -and $Key -eq 'adminAudit'){
                                    $match=[string]$data.UserId -ieq $upn -or [string]$data.ObjectId -ieq $upn -or [string]$data.ObjectId -ieq $objectId
                                    foreach($param in @($data.Parameters)){if([string]$param.Value -ieq $upn -or ($objectId -and [string]$param.Value -ieq $objectId)){$match=$true}}
                                }
                                if($match -and $seen.Add($(if($data.Id){[string]$data.Id}else{[string]$row.AuditData}))){$records.Add($row)}
                            }
                            Save-Source $Key $records.ToArray() @{state='running';startedAt=$began;query='Search-UnifiedAuditLog';note='Daily record-type slices; matching the affected mailbox owner rather than only the actor.'}
                            if($scanned -ge 50000){$state='partial';$errorText='A unified audit day/type slice reached 50,000 records. Narrow the time window; completeness is not established.';break}
                        }while($true)
                        $from=$to
                    }
                }
            }
        }
    }catch{$state=if($records.Count){'partial'}elseif($_.Exception.Message -match 'not available|403|Forbidden|access denied'){'unavailable'}else{'failed'};$errorText=$_.Exception.Message}
    Save-Source $Key $records.ToArray() @{state=$state;startedAt=$began;completedAt=[datetime]::UtcNow.ToString('o');error=$errorText;query=$(if($Key -in @('adminAudit','mailboxAudit')){'Search-UnifiedAuditLog'}else{$Key});note='Exchange PowerShell acquisition; permissions, retention and service limits apply. User audit matching uses the current UPN/object ID; historical aliases are not expanded.'}
}
