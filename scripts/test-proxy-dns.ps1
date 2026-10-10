$ErrorActionPreference='Stop'
$network='status-proxy-check-'+[guid]::NewGuid().ToString('N')
$created=@()
$root=Split-Path -Parent $PSScriptRoot
$configuration=Join-Path $root 'infra/nginx/default.conf'
$nginxImage=(& docker inspect status-nginx-1 --format '{{.Config.Image}}').Trim()
if($LASTEXITCODE -ne 0){throw 'Checked Nginx image required.'}
try {
    & docker network create $network | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Fixture network failed.'}
    foreach($marker in @('old','new')) {
        $server='const h=require("node:http");for(const port of [3000,8080])h.createServer((q,r)=>r.end("'+$marker+'")).listen(port,"0.0.0.0");'
        $container=(& docker run -d --network $network --network-alias frontend --network-alias backend --entrypoint node status-frontend:local -e $server).Trim()
        if($LASTEXITCODE -ne 0){throw 'Fixture server failed.'}
        $created+=$container
        if($marker -eq 'old') {
            $proxy=(& docker run -d --network $network --network-alias proxy --mount ('type=bind,source='+$configuration+',target=/etc/nginx/conf.d/default.conf,readonly') $nginxImage).Trim()
            if($LASTEXITCODE -ne 0){throw 'Fixture proxy failed.'}
            $created+=$proxy
        } else {
            & docker rm -f $created[0] | Out-Null
            if($LASTEXITCODE -ne 0){throw 'Fixture replacement failed.'}
        }
        $check='(async()=>{for(let n=0;n<30;n++){try{const a=await Promise.all(["/","/api/check"].map(async p=>(await fetch("http://proxy"+p,{signal:AbortSignal.timeout(1000)})).text()));if(a.every(v=>v==="'+$marker+'")){console.log("Proxy reached '+$marker+' frontend and backend.");return;}}catch{}await new Promise(r=>setTimeout(r,1000));}process.exitCode=1;})();'
        & docker run --rm --network $network --entrypoint node status-frontend:local -e $check
        if($LASTEXITCODE -ne 0){throw 'Proxy did not follow the replacement addresses.'}
    }
    Write-Output 'Container IP replacement passed without restarting Nginx.'
} finally {
    foreach($container in $created) {
        if($container -notmatch '^[a-f0-9]{64}$'){throw 'Unexpected fixture container ID.'}
        & docker rm -f $container 2>$null | Out-Null
    }
    if($network -notmatch '^status-proxy-check-[a-f0-9]{32}$'){throw 'Unexpected fixture network.'}
    & docker network rm $network | Out-Null
}
