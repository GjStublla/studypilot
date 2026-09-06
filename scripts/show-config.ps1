$response = Invoke-RestMethod `
    -Uri "https://rqszloxxegvxaedptcqj.supabase.co/functions/v1/show-config" `
    -Method Get

Write-Host ""
Write-Host "========== SUPABASE AI CONFIG ==========" -ForegroundColor Cyan
Write-Host ""

Write-Host "Text Model:           $($response.GEMINI_TEXT_MODEL)"
Write-Host "RAG Model:            $($response.GEMINI_RAG_MODEL)"
Write-Host "Live Model:           $($response.GEMINI_LIVE_MODEL)"
Write-Host "Vertex location:      $($response.VERTEX_LOCATION)"
Write-Host "vertex rag location:  $($response.VERTEX_RAG_LOCATION)"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""