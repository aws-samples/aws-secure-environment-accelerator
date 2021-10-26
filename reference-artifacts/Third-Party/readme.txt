Note:
firewall-example-previous.txt 
- was the firewall config utilized in v1.2.6-a and prior
- this was an Active-Active firewall config which only brought up 1 tunnel per firewall
- as the firewalls are A/A the second tunnel provided no net benefit

firewall-example-A-A-multitunnel.txt
- this configuration brings up the second tunnel on each firewall instance
- we also worked with the vendor to refine this sample configuration

firewall-example-A-A-singletunnel.txt
- customer wanting to continue to deploy single tunnel can leverage this sample
- this is similiar to the previous config but includes the refinements we made to the multitunnel config

