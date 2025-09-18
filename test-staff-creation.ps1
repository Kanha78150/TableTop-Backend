# Test Staff Creation with Department Field
Write-Host "Testing Staff Creation with Department Field..." -ForegroundColor Green

try {
    # Login first
    $loginBody = @{
        email = "admin@hotelsystem.com"
        password = "SuperAdmin123!"
    } | ConvertTo-Json
    
    $headers = @{ 'Content-Type' = 'application/json' }
    
    Write-Host "1. Logging in..." -ForegroundColor Yellow
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/admin/login" -Method POST -Headers $headers -Body $loginBody
    
    if ($loginResponse.success) {
        Write-Host "✅ Login successful" -ForegroundColor Green
        
        $authHeaders = @{
            'Content-Type' = 'application/json'
            'Authorization' = "Bearer $($loginResponse.data.accessToken)"
        }
        
        # Test staff creation
        Write-Host "2. Testing staff creation with department..." -ForegroundColor Yellow
        
        $staffBody = @{
            name = "Alice Waiter"
            email = "alice.test@hotel.com"
            phone = "9876543217"
            password = "Staff@123"
            role = "waiter"
            department = "service"
            hotelId = "68ca50a8adb255f59b8a5bc0"
            branchId = "68ca526b5dffb6f28c43bdb6"
            managerId = "68ca663611af55c396687500"
            permissions = @{
                takeOrders = $true
                updateOrderStatus = $true
                viewOrders = $true
                manageTableStatus = $true
                viewTableReservations = $true
                viewMenu = $true
                suggestMenuItems = $true
                handleComplaints = $true
                accessCustomerInfo = $true
                internalChat = $true
                emergencyAlerts = $true
            }
            emergencyContact = @{
                name = "Emergency Contact"
                phone = "9876543218"
                relationship = "Parent"
            }
        } | ConvertTo-Json -Depth 3
        
        $staffResponse = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/admin/staff" -Method POST -Headers $authHeaders -Body $staffBody
        
        if ($staffResponse.success) {
            Write-Host "✅ SUCCESS: Staff created with department!" -ForegroundColor Green
            Write-Host "Staff Name: $($staffResponse.data.staff.name)" -ForegroundColor Cyan
            Write-Host "Staff ID: $($staffResponse.data.staff.staffId)" -ForegroundColor Cyan
            Write-Host "Department: $($staffResponse.data.staff.department)" -ForegroundColor Cyan
            Write-Host "Role: $($staffResponse.data.staff.role)" -ForegroundColor Cyan
        } else {
            Write-Host "❌ Staff creation failed" -ForegroundColor Red
            Write-Host "Response: $($staffResponse | ConvertTo-Json)" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ Login failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

Write-Host "`nTest completed!" -ForegroundColor Green